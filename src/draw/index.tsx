/**
 * src/draw/index.tsx — Draw mode: photo → Netlist → Build mode
 *
 * Flow:
 *  idle → (take photo) → processing → (blur check) → scanning →
 *    (self-correcting loop) → result | error
 */
import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Netlist } from '../contracts/netlist'
import { solve } from '../physics'
import { processImage, BlurryImageError } from './imageUtils'
import { scanCircuit } from './scanApi'
import CircuitSVG from './CircuitSVG'

/* ── CSS variables injected via style tag below ── */
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    setPhase({ kind: 'processing' })

    // Step 1 — image cleanup + blur check
    let base64: string
    let previewUrl: string
    try {
      const result = await processImage(file)
      base64 = result.base64
      previewUrl = result.previewUrl
    } catch (err) {
      if (err instanceof BlurryImageError) {
        setPhase({ kind: 'error', message: err.message, blurry: true })
      } else {
        setPhase({
          kind: 'error',
          message: 'Could not process image. Please try again.',
          blurry: false,
        })
      }
      return
    }

    setPhase({ kind: 'scanning', previewUrl })

    // Step 2 — first API call
    const first = await scanCircuit(base64)
    if (!first.ok) {
      if (first.reason === 'network') {
        setPhase({ kind: 'error', previewUrl, message: first.message, blurry: false })
      } else {
        setPhase({ kind: 'error', previewUrl, message: first.message, blurry: false })
      }
      return
    }

    // Step 3 — self-correcting loop: run solve(), retry once with errors as hint
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
      // If second attempt fails, we still show the first netlist
    }

    setPhase({ kind: 'result', previewUrl, netlist: finalNetlist, isDemo })
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
      // Reset input so the same photo can be retaken
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
      <style>{`
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
          width: 44px;
          height: 44px;
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
        }

        .draw-content {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }

        /* ── Idle / take-photo ── */
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
        .photo-btn:hover, .photo-btn:focus-visible {
          opacity: 0.9;
          outline: 2px solid #fff;
        }
        .photo-btn:active {
          transform: scale(0.97);
        }

        .hint-text {
          color: rgba(255,255,255,0.55);
          font-size: 0.95rem;
          text-align: center;
        }

        /* ── Status / spinner ── */
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

        /* ── Preview ── */
        .preview-img {
          width: 100%;
          border-radius: var(--radius);
          object-fit: contain;
          max-height: 280px;
          background: rgba(0,0,0,0.3);
        }

        /* ── Result panels ── */
        .result-row {
          display: flex;
          gap: 16px;
          width: 100%;
          flex-wrap: wrap;
          justify-content: center;
        }

        .result-panel {
          flex: 1 1 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .panel-label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.5);
        }

        /* ── Parts list ── */
        .parts-list {
          background: var(--clr-surface);
          border-radius: var(--radius);
          padding: 16px;
          width: 100%;
          list-style: none;
          margin: 0;
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

        /* ── Action buttons ── */
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
        .btn-primary:hover, .btn-primary:focus-visible {
          opacity: 0.9;
          outline: 2px solid #fff;
        }
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

        /* ── Error ── */
        .error-box {
          background: rgba(239,83,80,0.12);
          border: 1px solid var(--clr-error);
          border-radius: var(--radius);
          padding: 20px 24px;
          text-align: center;
          width: 100%;
        }

        .error-icon {
          font-size: 2rem;
          margin-bottom: 8px;
        }

        .error-msg {
          font-size: 1.05rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 16px;
        }

        /* ── Demo banner ── */
        .demo-banner {
          background: rgba(255,213,79,0.15);
          border: 1px solid var(--clr-gold);
          border-radius: 10px;
          padding: 10px 16px;
          font-size: 0.88rem;
          color: var(--clr-gold);
          text-align: center;
          width: 100%;
        }

        /* ── Type icon colours ── */
        .icon-battery { color: #FFD54F; }
        .icon-bulb    { color: #FFF176; }
        .icon-resistor { color: #80DEEA; }
        .icon-switch  { color: #CE93D8; }
        .icon-wire    { color: #A5D6A7; }
      `}</style>

      <main className="draw-screen">
        <header className="draw-header">
          <button
            className="back-btn"
            onClick={() => navigate('/')}
            aria-label="Go back to home"
          >
            ←
          </button>
          <h1 className="draw-title">Draw Mode</h1>
        </header>

        {/* Hidden file input — triggered programmatically */}
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
                aria-label="Take a photo of your hand-drawn circuit"
              >
                <span aria-hidden="true">📷</span>
                Take photo of circuit
              </button>
              <p className="hint-text">
                Draw your circuit on paper, then photograph it. Pahunch will read it for you.
              </p>
            </>
          )}

          {phase.kind === 'processing' && (
            <div className="status-box" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p className="status-text">Preparing image…</p>
            </div>
          )}

          {phase.kind === 'scanning' && (
            <>
              <img
                src={phase.previewUrl}
                alt="Your circuit photo being analysed"
                className="preview-img"
              />
              <div className="status-box" role="status" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <p className="status-text">Reading your circuit…</p>
              </div>
            </>
          )}

          {phase.kind === 'result' && (
            <ResultView
              netlist={phase.netlist}
              previewUrl={phase.previewUrl}
              isDemo={phase.isDemo}
              onOpenBuild={() => openBuild(phase.netlist)}
              onRetake={retake}
            />
          )}

          {phase.kind === 'error' && (
            <ErrorView
              message={phase.message}
              blurry={phase.blurry}
              previewUrl={phase.previewUrl}
              onRetake={retake}
            />
          )}
        </div>
      </main>
    </>
  )
}

/* ── Sub-components ──────────────────────────────────────────────── */

interface ResultViewProps {
  netlist: Netlist
  previewUrl: string
  isDemo: boolean
  onOpenBuild: () => void
  onRetake: () => void
}

function ResultView({ netlist, previewUrl, isDemo, onOpenBuild, onRetake }: ResultViewProps) {
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
          Demo mode — no API key set. Showing a sample circuit.
        </div>
      )}

      <div className="result-row">
        <div className="result-panel">
          <span className="panel-label">Your photo</span>
          <img src={previewUrl} alt="Your original circuit photo" className="preview-img" />
        </div>
        <div className="result-panel">
          <span className="panel-label">What Pahunch read</span>
          <CircuitSVG netlist={netlist} />
        </div>
      </div>

      <section aria-label="Parts found" style={{ width: '100%' }}>
        <p className="parts-title">Parts found ({netlist.components.length})</p>
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
          Looks right → Open in Build mode
        </button>
        <button className="btn-secondary" onClick={onRetake}>
          Retake
        </button>
      </div>
    </>
  )
}

interface ErrorViewProps {
  message: string
  blurry: boolean
  previewUrl?: string
  onRetake: () => void
}

function ErrorView({ message, blurry, previewUrl, onRetake }: ErrorViewProps) {
  return (
    <>
      {previewUrl && (
        <img src={previewUrl} alt="Your circuit photo" className="preview-img" />
      )}
      <div className="error-box" role="alert">
        <div className="error-icon" aria-hidden="true">
          {blurry ? '📷' : '⚠️'}
        </div>
        <p className="error-msg">{message}</p>
        <button className="btn-secondary" onClick={onRetake} style={{ width: '100%' }}>
          {blurry ? 'Try again' : 'Retake photo'}
        </button>
      </div>
    </>
  )
}
