/**
 * src/draw/index.tsx — Draw mode: photo → Netlist → Build mode
 *
 * Flow:
 *  idle → (take photo) → processing → (blur check) → scanning →
 *    (self-correcting loop) → result | error
 *
 * Phase 2 additions:
 *  - Offline queue: failed network calls save the image to localStorage,
 *    auto-resend on the 'online' event, badge shows pending count.
 *  - i18n: all visible strings from content/i18n/draw.json via useDrawStrings().
 */
import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Netlist } from '../contracts/netlist'
import { solve } from '../physics'
import { processImage, BlurryImageError } from './imageUtils'
import { scanCircuit } from './scanApi'
import CircuitSVG from './CircuitSVG'
import { useDrawStrings } from './useDrawStrings'
import { useOfflineQueue } from './offlineQueue'

const LABEL_NAMES: Record<string, string> = {
  battery: 'Battery',
  bulb: 'Bulb / Lamp',
  resistor: 'Resistor',
  switch: 'Switch',
  wire: 'Wire',
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'scanning'; previewUrl: string }
  | { kind: 'result'; previewUrl: string; netlist: Netlist; isDemo: boolean }
  | { kind: 'error'; previewUrl?: string; message: string; blurry: boolean }

export default function DrawScreen() {
  const navigate = useNavigate()
  const s = useDrawStrings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  // Offline queue: sender returns true if the scan succeeded (we don't need the
  // netlist from background resends — just need them to leave the queue).
  const queueSender = useCallback(async (base64: string): Promise<boolean> => {
    const result = await scanCircuit(base64)
    return result.ok
  }, [])

  const { size: queueSize, save: saveToQueue, isDraining } = useOfflineQueue(queueSender)

  const handleFile = useCallback(
    async (file: File) => {
      setPhase({ kind: 'processing' })

      let base64: string
      let previewUrl: string
      try {
        const result = await processImage(file)
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
        } else {
          setPhase({ kind: 'error', previewUrl, message: first.message, blurry: false })
        }
        return
      }

      // Self-correcting loop
      const solveResult = solve(first.netlist)
      let finalNetlist = first.netlist
      let isDemo = first.isDemo

      if (solveResult.errors.length > 0) {
        const hint = solveResult.errors.join('; ')
        const second = await scanCircuit(base64, hint)
        if (second.ok) {
          finalNetlist = second.netlist
          isDemo = second.isDemo
        }
      }

      setPhase({ kind: 'result', previewUrl, netlist: finalNetlist, isDemo })
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

  const retake = useCallback(() => {
    setPhase({ kind: 'idle' })
    fileRef.current?.click()
  }, [])

  const openBuild = useCallback(
    (netlist: Netlist) => {
      navigate('/build', { state: { netlist } })
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

          {/* Offline queue badge */}
          {queueSize > 0 && (
            <span className="queue-badge" aria-label={`${queueSize} ${s.queue_badge}`}>
              {isDraining ? '↑' : queueSize}
            </span>
          )}
        </header>

        {isDraining && (
          <div className="drain-banner" role="status" aria-live="polite">
            {s.queue_sending}
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
                aria-label={s.take_photo}
              >
                <span aria-hidden="true">📷</span>
                {s.take_photo}
              </button>
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
              netlist={phase.netlist}
              previewUrl={phase.previewUrl}
              isDemo={phase.isDemo}
              strings={s}
              onOpenBuild={() => openBuild(phase.netlist)}
              onRetake={retake}
            />
          )}

          {phase.kind === 'error' && (
            <ErrorView
              message={phase.message}
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

/* ── Sub-components ──────────────────────────────────────────────── */

type DrawStr = ReturnType<typeof useDrawStrings>

interface ResultViewProps {
  netlist: Netlist
  previewUrl: string
  isDemo: boolean
  strings: DrawStr
  onOpenBuild: () => void
  onRetake: () => void
}

function ResultView({ netlist, previewUrl, isDemo, strings: s, onOpenBuild, onRetake }: ResultViewProps) {
  const typeIcons: Record<string, string> = {
    battery: '🔋',
    bulb: '💡',
    resistor: '〰️',
    switch: '🔌',
    wire: '🔗',
  }

  return (
    <>
      {isDemo && (
        <div className="demo-banner" role="note">
          {s.demo_banner}
        </div>
      )}

      <div className="result-row">
        <div className="result-panel">
          <span className="panel-label">{s.photo_label}</span>
          <img src={previewUrl} alt={s.photo_label} className="preview-img" />
        </div>
        <div className="result-panel">
          <span className="panel-label">{s.read_label}</span>
          <CircuitSVG netlist={netlist} />
        </div>
      </div>

      <section aria-label={s.parts_found} style={{ width: '100%' }}>
        <p className="parts-title">
          {s.parts_found} ({netlist.components.length})
        </p>
        <ul className="parts-list">
          {netlist.components.map((c) => (
            <li key={c.id}>
              <span aria-hidden="true">{typeIcons[c.type] ?? '?'}</span>
              <span>
                {LABEL_NAMES[c.type] ?? c.type}
                {c.value !== undefined && (
                  <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>
                    {c.value}
                    {c.type === 'resistor' ? 'Ω' : c.type === 'battery' ? 'V' : ''}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="action-row">
        <button className="btn-primary" onClick={onOpenBuild}>
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
    --clr-navy: #0B1B3F;
    --clr-accent: #4FC3F7;
    --clr-gold: #FFD54F;
    --clr-error: #EF5350;
    --clr-success: #66BB6A;
    --clr-surface: rgba(255, 255, 255, 0.07);
    --clr-surface-hover: rgba(255, 255, 255, 0.12);
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
    background: var(--clr-navy);
    color: #fff;
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
    margin-bottom: 32px;
  }

  .back-btn {
    background: var(--clr-surface);
    border: none;
    color: #fff;
    font-size: 1.4rem;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition);
    flex-shrink: 0;
  }
  .back-btn:hover, .back-btn:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }

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
    background: rgba(79,195,247,0.12);
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
    gap: 24px;
  }

  .photo-btn {
    background: var(--clr-accent);
    color: var(--clr-navy);
    border: none;
    border-radius: var(--radius);
    font-size: 1.25rem;
    font-weight: 700;
    padding: 20px 40px;
    cursor: pointer;
    width: 100%;
    transition: opacity var(--transition), transform var(--transition);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 72px;
  }
  .photo-btn:hover, .photo-btn:focus-visible { opacity: 0.9; outline: 2px solid #fff; }
  .photo-btn:active { transform: scale(0.97); }

  .hint-text {
    color: rgba(255,255,255,0.55);
    font-size: 0.95rem;
    text-align: center;
  }

  .status-box {
    background: var(--clr-surface);
    border-radius: var(--radius);
    padding: 32px 24px;
    text-align: center;
    width: 100%;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(79,195,247,0.3);
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
    max-height: 280px;
    background: rgba(0,0,0,0.3);
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
  }

  .panel-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.5);
  }

  .parts-list {
    background: var(--clr-surface);
    border-radius: var(--radius);
    padding: 16px;
    width: 100%;
    list-style: none;
    margin: 0;
    box-sizing: border-box;
  }
  .parts-list li {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .parts-list li:last-child { border-bottom: none; }

  .parts-title {
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.5);
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
    border: none;
    border-radius: var(--radius);
    font-size: 1.05rem;
    font-weight: 700;
    padding: 16px 24px;
    cursor: pointer;
    transition: opacity var(--transition), transform var(--transition);
    min-height: 56px;
  }
  .btn-primary:hover, .btn-primary:focus-visible { opacity: 0.9; outline: 2px solid #fff; }
  .btn-primary:active { transform: scale(0.97); }

  .btn-secondary {
    flex: 1 1 100px;
    background: var(--clr-surface);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: var(--radius);
    font-size: 1rem;
    font-weight: 600;
    padding: 16px 24px;
    cursor: pointer;
    transition: background var(--transition);
    min-height: 56px;
  }
  .btn-secondary:hover, .btn-secondary:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }

  .error-box {
    background: rgba(239,83,80,0.12);
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
    background: rgba(255,213,79,0.15);
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
