/**
 * src/draw/index.tsx — Draw mode: photo → Netlist → Build mode
 *
 * Flow:
 *  idle (take photo OR try a sample drawing) → processing → scanning →
 *    (self-correcting loop) → result with Tap-to-Fix & live solve() | error
 *
 * Phase 3 additions:
 *  - Tap-to-fix on the scanned result:
 *    • Tap any part to cycle its type (battery -> bulb -> resistor -> switch -> wire)
 *    • Delete button for selected parts
 *    • Tap between two dots to add a wire (or tap dot A then dot B)
 *    • Live solve() check & glowing bulbs update in real time
 *  - Confidence indicator (if below 0.6, shows "Please check the circuit")
 *  - "Try a sample drawing" button loading 3 bundled sample PNGs
 */
import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Netlist, CircuitComponent, ComponentType, GridPoint, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { processImage, BlurryImageError } from './imageUtils'
import { scanCircuit } from './scanApi'
import CircuitSVG from './CircuitSVG'
import { useDrawStrings } from './useDrawStrings'
import { useOfflineQueue } from './offlineQueue'
import { findInteriorWires, findSuspectWires, HINT_SHORT_OR_PHANTOM_WIRE } from './suspectWire'

import sample1Png from './samples/sample1.png'
import sample2Png from './samples/sample2.png'
import sample3Png from './samples/sample3.png'
import sample1Json from './samples/sample1.json'
import sample2Json from './samples/sample2.json'
import sample3Json from './samples/sample3.json'
import { hashBase64, getCachedScan, setCachedScan } from './scanCache'

const SAMPLES_DATA: Record<string, { png: string; netlist: Netlist }> = {
  sample1_series: { png: sample1Png, netlist: sample1Json as Netlist },
  sample2_parallel: { png: sample2Png, netlist: sample2Json as Netlist },
  sample3_resistor: { png: sample3Png, netlist: sample3Json as Netlist },
}

const LABEL_NAMES: Record<string, string> = {
  battery: 'Battery',
  bulb: 'Bulb / Lamp',
  resistor: 'Resistor',
  switch: 'Switch',
  wire: 'Wire',
}

const COMPONENT_CYCLE: ComponentType[] = ['battery', 'bulb', 'resistor', 'switch', 'wire']

function getNextType(current: ComponentType): ComponentType {
  const idx = COMPONENT_CYCLE.indexOf(current)
  return COMPONENT_CYCLE[(idx + 1) % COMPONENT_CYCLE.length]
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'scanning'; previewUrl: string }
  | {
      kind: 'result'
      previewUrl: string
      netlist: Netlist
      confidence: number
      isDemo: boolean
    }
  | { kind: 'error'; previewUrl?: string; message: string; blurry: boolean }

export default function DrawScreen() {
  const navigate = useNavigate()
  const s = useDrawStrings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [showSamples, setShowSamples] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  // Countdown timer for 429 rate limit cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  // Offline queue sender with rate limit detection & cache update
  const queueSender = useCallback(async (base64: string) => {
    const result = await scanCircuit(base64)
    if (result.ok) {
      const hash = hashBase64(base64)
      setCachedScan(hash, {
        netlist: result.netlist,
        confidence: result.confidence,
        isDemo: result.isDemo,
      })
      return { ok: true, rateLimited: false }
    }
    return { ok: false, rateLimited: result.reason === 'rate_limit' }
  }, [])

  const {
    size: queueSize,
    save: saveToQueue,
    isDraining,
    progress: queueProgress,
  } = useOfflineQueue(queueSender)

  const handleFile = useCallback(
    async (file: File | Blob, options?: { skipBlur?: boolean }) => {
      setPhase({ kind: 'processing' })

      let base64: string
      let previewUrl: string
      try {
        const result = await processImage(file, options)
        base64 = result.base64
        previewUrl = result.previewUrl
      } catch (err) {
        if (err instanceof BlurryImageError) {
          setPhase({ kind: 'error', message: s.blurry_msg, blurry: true })
        } else {
          setPhase({ kind: 'error', message: s.error_retake, blurry: false })
        }
        return
      }

      // Check scan cache: repeat photo returns instantly without API call
      const hash = hashBase64(base64)
      const cached = getCachedScan(hash)
      if (cached) {
        setPhase({
          kind: 'result',
          previewUrl,
          netlist: cached.netlist,
          confidence: cached.confidence,
          isDemo: cached.isDemo,
        })
        return
      }

      setPhase({ kind: 'scanning', previewUrl })

      const first = await scanCircuit(base64)
      if (!first.ok) {
        if (first.reason === 'network') {
          saveToQueue(base64)
          setPhase({
            kind: 'error',
            previewUrl,
            message: s.saved_offline,
            blurry: false,
          })
        } else if (first.reason === 'rate_limit') {
          const sec = first.retryAfterSeconds ?? 30
          setCooldownSeconds(sec)
          setPhase({
            kind: 'error',
            previewUrl,
            message: `Busy, try again in ${sec}s`,
            blurry: false,
          })
        } else {
          setPhase({
            kind: 'error',
            previewUrl,
            message: s.server_error,
            blurry: false,
          })
        }
        return
      }

      // Self-correcting loop: check for short circuit or interior phantom wire
      const solveResult = solve(first.netlist)
      let finalNetlist = first.netlist
      let isDemo = first.isDemo
      let confidence = first.confidence

      const hasShort = solveResult.errors.includes('short_circuit')
      const hasInteriorWire = findInteriorWires(first.netlist).length > 0

      if (hasShort || hasInteriorWire) {
        const second = await scanCircuit(base64, HINT_SHORT_OR_PHANTOM_WIRE)
        if (second.ok) {
          finalNetlist = second.netlist
          isDemo = second.isDemo
          confidence = second.confidence
        }
      } else if (solveResult.errors.length > 0) {
        const hint = solveResult.errors.join('; ')
        const second = await scanCircuit(base64, hint)
        if (second.ok) {
          finalNetlist = second.netlist
          isDemo = second.isDemo
          confidence = second.confidence
        }
      }

      // Save successful scan to cache
      setCachedScan(hash, {
        netlist: finalNetlist,
        confidence,
        isDemo,
      })

      setPhase({
        kind: 'result',
        previewUrl,
        netlist: finalNetlist,
        confidence,
        isDemo,
      })
    },
    [s, saveToQueue],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
      e.target.value = ''
    },
    [handleFile],
  )

  const handleSelectSample = useCallback((sampleKey: string) => {
    setShowSamples(false)
    const sample = SAMPLES_DATA[sampleKey]
    if (sample) {
      setPhase({
        kind: 'result',
        previewUrl: sample.png,
        netlist: sample.netlist,
        confidence: 1.0,
        isDemo: false,
      })
    }
  }, [])

  const retake = useCallback(() => {
    setShowSamples(false)
    setPhase({ kind: 'idle' })
    fileRef.current?.click()
  }, [])

  const openBuild = useCallback(
    (netlistToOpen: Netlist) => {
      navigate('/build', { state: { netlist: netlistToOpen } })
    },
    [navigate],
  )

  return (
    <>
      <style>{STYLES}</style>
      <main className="draw-screen">
        <header className="draw-header">
          <button className="back-btn" onClick={() => navigate('/')} aria-label="Go back to home">
            ←
          </button>
          <h1 className="draw-title">{s.title}</h1>

          {queueSize > 0 && (
            <span className="queue-badge" aria-label={`${queueSize} ${s.queue_badge}`}>
              {isDraining ? '↑' : queueSize}
            </span>
          )}
        </header>

        {isDraining && (
          <div className="drain-banner" role="status" aria-live="polite">
            {queueProgress
              ? `Sending saved circuit ${queueProgress.current} of ${queueProgress.total}…`
              : s.queue_sending}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleInputChange}
          aria-hidden="true"
        />

        <div className="draw-content">
          {phase.kind === 'idle' && (
            <>
              <button
                className="photo-btn"
                onClick={() => fileRef.current?.click()}
                aria-label={cooldownSeconds > 0 ? `Busy, try again in ${cooldownSeconds}s` : s.take_photo}
                disabled={cooldownSeconds > 0}
              >
                <span aria-hidden="true">📷</span>
                {cooldownSeconds > 0 ? `Busy, try again in ${cooldownSeconds}s` : s.take_photo}
              </button>

              <div className="or-divider" aria-hidden="true">
                <span>{s.or_divider}</span>
              </div>

              <button
                className="sample-btn"
                onClick={() => setShowSamples((prev) => !prev)}
                aria-label={s.try_sample}
              >
                <span aria-hidden="true">✏️</span>
                {s.try_sample}
              </button>

              {showSamples && (
                <section className="samples-container" aria-label={s.select_sample}>
                  <p className="samples-title">{s.select_sample}</p>
                  <div className="samples-grid">
                    <button
                      className="sample-card"
                      onClick={() => handleSelectSample('sample1_series')}
                    >
                      <img src={sample1Png} alt={s.sample_series} className="sample-thumb" />
                      <span className="sample-card-title">{s.sample_series}</span>
                    </button>

                    <button
                      className="sample-card"
                      onClick={() => handleSelectSample('sample2_parallel')}
                    >
                      <img src={sample2Png} alt={s.sample_parallel} className="sample-thumb" />
                      <span className="sample-card-title">{s.sample_parallel}</span>
                    </button>

                    <button
                      className="sample-card"
                      onClick={() => handleSelectSample('sample3_resistor')}
                    >
                      <img src={sample3Png} alt={s.sample_resistor} className="sample-thumb" />
                      <span className="sample-card-title">{s.sample_resistor}</span>
                    </button>
                  </div>
                </section>
              )}

              <p className="hint-text">{s.hint_text}</p>
            </>
          )}

          {phase.kind === 'processing' && (
            <div className="status-box" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p className="status-text">{s.processing}</p>
            </div>
          )}

          {phase.kind === 'scanning' && (
            <>
              <img src={phase.previewUrl} alt={s.photo_label} className="preview-img" />
              <div className="status-box" role="status" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <p className="status-text">{s.scanning}</p>
              </div>
            </>
          )}

          {phase.kind === 'result' && (
            <ResultView
              initialNetlist={phase.netlist}
              confidence={phase.confidence}
              previewUrl={phase.previewUrl}
              isDemo={phase.isDemo}
              strings={s}
              onOpenBuild={openBuild}
              onRetake={retake}
            />
          )}

          {phase.kind === 'error' && (
            <ErrorView
              message={cooldownSeconds > 0 ? `Busy, try again in ${cooldownSeconds}s` : phase.message}
              blurry={phase.blurry}
              previewUrl={phase.previewUrl}
              strings={s}
              onRetake={retake}
            />
          )}
        </div>
      </main>
    </>
  )
}

/* ── Interactive Result View with Tap-to-Fix ───────────────────────── */

type DrawStr = ReturnType<typeof useDrawStrings>

interface ResultViewProps {
  initialNetlist: Netlist
  confidence: number
  previewUrl: string
  isDemo: boolean
  strings: DrawStr
  onOpenBuild: (netlist: Netlist) => void
  onRetake: () => void
}

function formatSolveMessage(solveResult: SolveResult, s: DrawStr): string {
  if (solveResult.ok) {
    const activeBulbs = solveResult.components.filter((c) => c.state !== 'off')
    if (activeBulbs.length > 0) {
      return `${s.circuit_working} (${activeBulbs.length} lit)`
    }
    return s.circuit_working
  }
  if (solveResult.errors.includes('no_battery')) return s.circuit_no_battery
  if (solveResult.errors.includes('short_circuit')) return s.circuit_short
  if (solveResult.errors.includes('open_circuit')) return s.circuit_open
  return solveResult.errors.join(', ')
}

function ResultView({
  initialNetlist,
  confidence,
  previewUrl,
  isDemo,
  strings: s,
  onOpenBuild,
  onRetake,
}: ResultViewProps) {
  const [netlist, setNetlist] = useState<Netlist>(initialNetlist)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDot, setActiveDot] = useState<GridPoint | null>(null)

  // Live physics check
  const solveResult = useMemo(() => solve(netlist), [netlist])
  const suspectWires = useMemo(() => findSuspectWires(netlist, solveResult), [netlist, solveResult])
  const suspectWireIds = useMemo(() => suspectWires.map((w) => w.id), [suspectWires])
  const hasShort = solveResult.errors.includes('short_circuit')

  const typeIcons: Record<string, string> = {
    battery: '🔋',
    bulb: '💡',
    resistor: '〰️',
    switch: '🔌',
    wire: '🔗',
  }

  // Cycle component type
  const cycleComponent = useCallback((id: string) => {
    setNetlist((prev) => {
      const updated = prev.components.map((c) => {
        if (c.id !== id) return c
        const nextType = getNextType(c.type)
        const comp: CircuitComponent = { ...c, type: nextType }
        if (nextType === 'battery') comp.value = 9
        else if (nextType === 'resistor') comp.value = 10
        else if (nextType === 'switch') comp.closed = true
        else {
          delete comp.value
          delete comp.closed
        }
        return comp
      })
      return { ...prev, components: updated }
    })
    setSelectedId(id)
  }, [])

  // Delete component
  const deleteComponent = useCallback((id: string) => {
    setNetlist((prev) => ({
      ...prev,
      components: prev.components.filter((c) => c.id !== id),
    }))
    setSelectedId((prev) => (prev === id ? null : prev))
  }, [])

  // Add wire between two dots
  const addWire = useCallback((from: GridPoint, to: GridPoint) => {
    const newId = `wire_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setNetlist((prev) => {
      const exists = prev.components.some(
        (c) =>
          (c.from.row === from.row && c.from.col === from.col && c.to.row === to.row && c.to.col === to.col) ||
          (c.from.row === to.row && c.from.col === to.col && c.to.row === from.row && c.to.col === from.col),
      )
      if (exists) return prev
      return {
        ...prev,
        components: [...prev.components, { id: newId, type: 'wire', from, to }],
      }
    })
    setSelectedId(newId)
    setActiveDot(null)
  }, [])

  // Handle dot tap for 2-dot sequential wire connection
  const handleDotTap = useCallback(
    (pt: GridPoint) => {
      if (!activeDot) {
        setActiveDot(pt)
        return
      }
      if (activeDot.row === pt.row && activeDot.col === pt.col) {
        setActiveDot(null)
        return
      }
      addWire(activeDot, pt)
    },
    [activeDot, addWire],
  )

  const selectedComp = netlist.components.find((c) => c.id === selectedId)
  const isLowConfidence = confidence < 0.6

  return (
    <>
      {isDemo && (
        <div className="demo-banner" role="note">
          {s.demo_banner}
        </div>
      )}

      {/* Low confidence warning banner */}
      {isLowConfidence && (
        <div className="confidence-banner" role="alert">
          <span className="banner-icon" aria-hidden="true">⚠️</span>
          <div>
            <strong>{s.check_circuit}</strong>
            <p className="confidence-subtext">{s.check_circuit_hint}</p>
          </div>
        </div>
      )}

      {/* Live Solve Status Banner */}
      <div
        className={`solve-banner ${solveResult.ok ? 'solve-ok' : 'solve-error'}`}
        role="status"
        aria-live="polite"
      >
        <span className="banner-icon" aria-hidden="true">
          {solveResult.ok ? '✓' : '⚠️'}
        </span>
        <span className="solve-msg">{formatSolveMessage(solveResult, s)}</span>
      </div>

      {/* Suspect wire short warning banner */}
      {(hasShort || suspectWireIds.length > 0) && (
        <div className="suspect-wire-banner" role="alert">
          <span className="banner-icon" aria-hidden="true">⚠️</span>
          <span className="suspect-wire-text">{s.suspect_wire_msg}</span>
        </div>
      )}

      <div className="result-row">
        <div className="result-panel">
          <span className="panel-label">{s.photo_label}</span>
          <img src={previewUrl} alt={s.photo_label} className="preview-img" />
        </div>
        <div className="result-panel">
          <span className="panel-label">{s.read_label}</span>
          <CircuitSVG
            netlist={netlist}
            solveResult={solveResult}
            selectedId={selectedId}
            suspectWireIds={suspectWireIds}
            activeDot={activeDot}
            interactive={true}
            onComponentTap={(id) => {
              if (suspectWireIds.includes(id)) {
                deleteComponent(id)
              } else {
                cycleComponent(id)
              }
            }}
            onDotTap={handleDotTap}
            onAddWire={addWire}
          />
        </div>
      </div>

      {/* Tap-to-fix helper instructions */}
      <p className="tap-hint">{s.tap_to_fix_hint}</p>

      {/* Selected part toolbar */}
      {selectedComp && (
        <div className="selected-toolbar" aria-label="Component editor">
          <div className="selected-details">
            <span className="selected-label">{s.selected}:</span>
            <span className="selected-name">
              {typeIcons[selectedComp.type]} {LABEL_NAMES[selectedComp.type] ?? selectedComp.type}
            </span>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="action-pill cycle-pill"
              onClick={() => cycleComponent(selectedComp.id)}
              aria-label={`${s.cycle_type} ${selectedComp.id}`}
            >
              ⟳ {s.cycle_type}
            </button>
            <button
              type="button"
              className="action-pill delete-pill"
              onClick={() => deleteComponent(selectedComp.id)}
              aria-label={`${s.delete_part} ${selectedComp.id}`}
            >
              🗑 {s.delete_part}
            </button>
          </div>
        </div>
      )}

      {/* Parts found list */}
      <section aria-label={s.parts_found} style={{ width: '100%' }}>
        <p className="parts-title">
          {s.parts_found} ({netlist.components.length})
        </p>
        <ul className="parts-list">
          {netlist.components.map((c) => {
            const isSelected = c.id === selectedId
            return (
              <li
                key={c.id}
                className={`part-item ${isSelected ? 'part-item-selected' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="part-info">
                  <span className="part-icon" aria-hidden="true">
                    {typeIcons[c.type] ?? '?'}
                  </span>
                  <span className="part-name">
                    {LABEL_NAMES[c.type] ?? c.type}
                    {c.value !== undefined && (
                      <span className="part-value">
                        {' '}({c.value}
                        {c.type === 'resistor' ? 'Ω' : c.type === 'battery' ? 'V' : ''})
                      </span>
                    )}
                  </span>
                </div>
                <div className="part-actions">
                  <button
                    type="button"
                    className="icon-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      cycleComponent(c.id)
                    }}
                    title={s.cycle_type}
                    aria-label={`${s.cycle_type} ${c.id}`}
                  >
                    ⟳
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn delete-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteComponent(c.id)
                    }}
                    title={s.delete_part}
                    aria-label={`${s.delete_part} ${c.id}`}
                  >
                    🗑
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Bottom actions */}
      <div className="action-row">
        <button className="btn-primary" onClick={() => onOpenBuild(netlist)}>
          {s.open_build}
        </button>
        <button className="btn-secondary" onClick={onRetake}>
          {s.retake}
        </button>
      </div>
    </>
  )
}

interface ErrorViewProps {
  message: string
  blurry: boolean
  previewUrl?: string
  strings: DrawStr
  onRetake: () => void
}

function ErrorView({ message, blurry, previewUrl, strings: s, onRetake }: ErrorViewProps) {
  return (
    <>
      {previewUrl && <img src={previewUrl} alt={s.photo_label} className="preview-img" />}
      <div className="error-box" role="alert">
        <div className="error-icon" aria-hidden="true">
          {blurry ? '📷' : '⚠️'}
        </div>
        <p className="error-msg">{message}</p>
        <button className="btn-secondary" onClick={onRetake} style={{ width: '100%' }}>
          {blurry ? s.error_retry : s.error_retake}
        </button>
      </div>
    </>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */
const STYLES = `
  :root {
    --clr-navy: #0f0f0f;
    --clr-accent: #2f8f88;
    --clr-accent-deep: #1f6b66;
    --clr-gold: #e2672e;
    --clr-error: #d4452b;
    --clr-success: #2f8f88;
    --clr-cream: #f1e6cf;
    --clr-surface: rgba(241, 230, 207, 0.08);
    --clr-surface-hover: rgba(241, 230, 207, 0.16);
    --radius: 16px;
    --transition: 0.25s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  .draw-screen {
    min-height: 100vh;
    background: transparent;
    color: var(--clr-cream);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
    box-sizing: border-box;
  }

  .draw-header {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 480px;
    margin-bottom: 24px;
  }

  .back-btn {
    background: var(--clr-cream);
    border: 3px solid var(--clr-navy);
    color: var(--clr-navy);
    font-size: 1.4rem;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 120ms ease, box-shadow 120ms ease;
    flex-shrink: 0;
  }
  .back-btn:hover, .back-btn:focus-visible {
    box-shadow: 3px 3px 0 var(--clr-gold);
    outline: 2px solid var(--clr-gold);
  }
  .back-btn:active { transform: translateY(2px); box-shadow: none; }

  .draw-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    flex: 1;
  }

  .queue-badge {
    background: var(--clr-gold);
    color: var(--clr-navy);
    font-size: 0.8rem;
    font-weight: 700;
    min-width: 24px;
    height: 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    flex-shrink: 0;
  }

  .drain-banner {
    background: rgba(47,143,136,0.12);
    border: 1px solid var(--clr-accent);
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 0.88rem;
    color: var(--clr-accent);
    text-align: center;
    width: 100%;
    max-width: 480px;
    margin-bottom: 16px;
    box-sizing: border-box;
  }

  .draw-content {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    background: #0f0f0f;
    border: 2px solid var(--clr-cream);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.4);
  }

  .photo-btn {
    background: var(--clr-gold);
    color: var(--clr-navy);
    border: 3px solid var(--clr-navy);
    border-radius: 999px;
    font-size: 1.25rem;
    font-weight: 800;
    padding: 20px 24px;
    cursor: pointer;
    width: 100%;
    transition: transform 120ms ease, box-shadow 120ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 72px;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.4);
  }
  .photo-btn:hover, .photo-btn:focus-visible { box-shadow: 6px 6px 0 var(--clr-accent); outline: 2px solid var(--clr-cream); }
  .photo-btn:active { transform: translateY(2px); box-shadow: none; }

  .or-divider {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 16px;
    color: rgba(241, 230, 207, 0.4);
    font-size: 0.9rem;
    text-transform: uppercase;
  }
  .or-divider::before, .or-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(241, 230, 207, 0.15);
  }

  .sample-btn {
    background: var(--clr-accent);
    color: var(--clr-cream);
    border: 3px solid var(--clr-navy);
    border-radius: 999px;
    font-size: 1.1rem;
    font-weight: 800;
    padding: 16px 24px;
    cursor: pointer;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 60px;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .sample-btn:hover, .sample-btn:focus-visible {
    background: var(--clr-accent-deep);
    outline: 2px solid var(--clr-gold);
    box-shadow: 4px 4px 0 var(--clr-gold);
  }
  .sample-btn:active { transform: translateY(2px); box-shadow: none; }

  .samples-container {
    background: #0f0f0f;
    border: 1px solid rgba(241, 230, 207, 0.15);
    border-radius: var(--radius);
    padding: 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .samples-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(241, 230, 207, 0.8);
    margin: 0 0 12px 0;
    text-align: center;
  }

  .samples-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .sample-card {
    background: var(--clr-surface);
    border: 1px solid rgba(241, 230, 207, 0.15);
    border-radius: 12px;
    padding: 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: #fff;
    transition: background var(--transition), transform var(--transition);
  }
  .sample-card:hover, .sample-card:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }
  .sample-card:active { transform: scale(0.96); }

  .sample-thumb {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 8px;
    background: #fff;
  }

  .sample-card-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
  }

  .hint-text {
    color: rgba(241,230,207,0.55);
    font-size: 0.95rem;
    text-align: center;
    margin: 4px 0 0;
  }

  .status-box {
    background: #0f0f0f;
    border-radius: var(--radius);
    padding: 32px 24px;
    text-align: center;
    width: 100%;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(47,143,136,0.3);
    border-top-color: var(--clr-accent);
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .status-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--clr-accent);
  }

  .preview-img {
    width: 100%;
    border-radius: var(--radius);
    object-fit: contain;
    max-height: 240px;
    background: #0f0f0f;
  }

  .result-row {
    display: flex;
    gap: 16px;
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
  }

  .result-panel {
    flex: 1 1 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: #0f0f0f;
    border: 1px solid rgba(241, 230, 207, 0.15);
    border-radius: var(--radius);
    padding: 12px;
    box-sizing: border-box;
  }

  .panel-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(241,230,207,0.5);
  }

  /* Suspect wire short warning banner */
  .suspect-wire-banner {
    background: rgba(255, 152, 0, 0.15);
    border: 2px solid #FF9800;
    border-radius: 12px;
    padding: 12px 16px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #FFB74D;
    font-weight: 600;
    font-size: 0.95rem;
  }
  .suspect-wire-text {
    flex: 1;
  }

  /* Confidence banner */
  .confidence-banner {
    background: rgba(226, 103, 46, 0.15);
    border: 1px solid var(--clr-gold);
    border-radius: 12px;
    padding: 12px 16px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--clr-gold);
  }
  .banner-icon { font-size: 1.3rem; flex-shrink: 0; }
  .confidence-subtext {
    margin: 2px 0 0;
    font-size: 0.82rem;
    color: rgba(241, 230, 207, 0.8);
  }

  /* Live solve banner */
  .solve-banner {
    border-radius: 12px;
    padding: 12px 16px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .solve-ok {
    background: rgba(47, 143, 136, 0.15);
    border: 1px solid var(--clr-success);
    color: var(--clr-success);
  }
  .solve-error {
    background: rgba(212, 69, 43, 0.15);
    border: 1px solid var(--clr-error);
    color: #fff;
  }
  .solve-msg { flex: 1; }

  .tap-hint {
    font-size: 0.85rem;
    color: rgba(241, 230, 207, 0.6);
    text-align: center;
    margin: 0;
  }

  /* Selected component floating toolbar */
  .selected-toolbar {
    background: rgba(226, 103, 46, 0.12);
    border: 1px solid var(--clr-gold);
    border-radius: 12px;
    padding: 10px 14px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .selected-details {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
  }
  .selected-label { color: rgba(241,230,207,0.6); }
  .selected-name { font-weight: 700; color: var(--clr-gold); }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .action-pill {
    border: none;
    border-radius: 20px;
    padding: 8px 14px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: opacity var(--transition);
  }
  .action-pill:hover, .action-pill:focus-visible { opacity: 0.9; }

  .cycle-pill {
    background: var(--clr-accent);
    color: var(--clr-navy);
  }

  .delete-pill {
    background: rgba(212, 69, 43, 0.25);
    color: #ffcdd2;
    border: 1px solid var(--clr-error);
  }

  /* Parts list */
  .parts-list {
    background: var(--clr-surface);
    border-radius: var(--radius);
    padding: 8px;
    width: 100%;
    list-style: none;
    margin: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .part-item {
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(241, 230, 207, 0.03);
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    transition: background var(--transition);
  }
  .part-item:hover { background: rgba(241, 230, 207, 0.08); }
  .part-item-selected {
    background: rgba(226, 103, 46, 0.15) !important;
    border: 1px solid var(--clr-gold);
  }

  .part-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }
  .part-icon { font-size: 1.1rem; }
  .part-name { font-weight: 500; }
  .part-value { color: rgba(241, 230, 207, 0.5); font-size: 0.85rem; }

  .part-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-action-btn {
    background: var(--clr-surface);
    color: #fff;
    border: 1px solid rgba(241, 230, 207, 0.2);
    border-radius: 8px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1rem;
    transition: background var(--transition);
  }
  .icon-action-btn:hover, .icon-action-btn:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }
  .delete-icon-btn:hover {
    border-color: var(--clr-error);
    background: rgba(212, 69, 43, 0.2);
  }

  .parts-title {
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(241,230,207,0.5);
    margin: 0 0 8px 0;
    align-self: flex-start;
  }

  .action-row {
    display: flex;
    gap: 12px;
    width: 100%;
    flex-wrap: wrap;
  }

  .btn-primary {
    flex: 2 1 180px;
    background: var(--clr-gold);
    color: var(--clr-navy);
    border: 3px solid var(--clr-navy);
    border-radius: 999px;
    font-size: 1.05rem;
    font-weight: 800;
    padding: 16px 24px;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
    min-height: 56px;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.4);
  }
  .btn-primary:hover, .btn-primary:focus-visible { box-shadow: 6px 6px 0 var(--clr-accent); outline: 2px solid var(--clr-cream); }
  .btn-primary:active { transform: translateY(2px); box-shadow: none; }

  .btn-secondary {
    flex: 1 1 100px;
    background: var(--clr-accent);
    color: var(--clr-cream);
    border: 3px solid var(--clr-navy);
    border-radius: 999px;
    font-size: 1rem;
    font-weight: 800;
    padding: 16px 24px;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
    min-height: 56px;
  }
  .btn-secondary:hover, .btn-secondary:focus-visible {
    background: var(--clr-accent-deep);
    outline: 2px solid var(--clr-gold);
    box-shadow: 4px 4px 0 var(--clr-gold);
  }
  .btn-secondary:active { transform: translateY(2px); box-shadow: none; }

  .error-box {
    background: rgba(212,69,43,0.12);
    border: 1px solid var(--clr-error);
    border-radius: var(--radius);
    padding: 20px 24px;
    text-align: center;
    width: 100%;
    box-sizing: border-box;
  }

  .error-icon { font-size: 2rem; margin-bottom: 8px; }

  .error-msg {
    font-size: 1.05rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 16px;
  }

  .demo-banner {
    background: rgba(226,103,46,0.15);
    border: 1px solid var(--clr-gold);
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 0.88rem;
    color: var(--clr-gold);
    text-align: center;
    width: 100%;
    box-sizing: border-box;
  }
`
