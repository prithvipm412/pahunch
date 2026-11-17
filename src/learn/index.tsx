/**
 * src/learn/index.tsx — Learn screen: Predict tab + Fault Hunt tab
 *
 * Predict:
 *  - Accepts router state { netlist, mode: 'predict' } from Build mode.
 *  - Otherwise shows 4 preset challenges.
 *  - Ask → Choose → Reveal (run solve, glow bulbs, grade, play audio) → Next.
 *
 * Fault Hunt:
 *  - 3 puzzles from puzzles.ts.
 *  - Tap the broken component → correct (fix + solve) or wrong (try again, hint after 2).
 *
 * Level Goal-Checks:
 *  - Uses describeCircuit() (topology + counts) and SolveResult (component states + errors) from src/physics
 *  - Gracefully stops audio using stopAll() from src/audio
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { describeCircuit } from '../physics/describe'
// TODO: Codex (L2) is refining stopAll() in src/audio; calling existing stopAll() from src/audio
import { playClip, playSequence, stopAll } from '../audio'
import { useLanguage } from '../app/lang'
import { useLearnStrings } from './useLearnStrings'
import GlowCircuitSVG from './GlowCircuitSVG'
import { FAULT_PUZZLES } from './puzzles'

/* ── Preset Predict challenges ──────────────────────────────────── */
const PRESET_CHALLENGES: Array<{ key: string; netlist: Netlist }> = [
  {
    key: 'series',
    netlist: {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    key: 'parallel',
    netlist: {
      gridSize: 3,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    key: 'switch',
    netlist: {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    key: 'resistor',
    netlist: {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 2 }, to: { row: 0, col: 3 }, value: 10 },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
]

export type PredictOption = 'both_bright' | 'both_dim' | 'one_each' | 'both_off'

/**
 * Evaluates circuit outcome using both SolveResult and describeCircuit() structure.
 */
export function gradeResult(result: SolveResult, netlist: Netlist): PredictOption {
  const desc = describeCircuit(netlist)
  const bulbIds = new Set(
    netlist.components.filter((c) => c.type === 'bulb').map((c) => c.id),
  )
  const bulbs = result.components.filter((c) => bulbIds.has(c.id))

  if (bulbs.length === 0 || desc.topology === 'empty') return 'both_off'
  if (!result.ok || desc.topology === 'incomplete' || bulbs.every((b) => b.state === 'off')) {
    return 'both_off'
  }
  if (bulbs.length === 1) {
    const s = bulbs[0].state
    if (s === 'bright' || s === 'normal') return 'both_bright'
    if (s === 'dim') return 'both_dim'
    return 'both_off'
  }
  // Two or more bulbs
  const states = bulbs.map((b) => b.state)
  const allOff = states.every((s) => s === 'off')
  if (allOff) return 'both_off'
  const allBright = states.every((s) => s === 'bright' || s === 'normal')
  if (allBright) return 'both_bright'
  const allDim = states.every((s) => s === 'dim')
  if (allDim) return 'both_dim'
  return 'one_each'
}

/**
 * Determines appropriate explanation & follow-up suggestion based on challenge key
 * or dynamic structural analysis via describeCircuit().
 */
export function challengeAudio(
  key: string,
  netlist: Netlist,
  result: SolveResult,
): { explain: string; explainText: string; try: string; tryText: string } {
  const desc = describeCircuit(netlist)

  if (key === 'series') {
    return {
      explain: 'explain_series',
      explainText: 'In series, they share voltage and glow dim.',
      try: 'try_parallel',
      tryText: 'Try connecting bulbs in parallel instead.',
    }
  }
  if (key === 'parallel') {
    return {
      explain: 'explain_parallel',
      explainText: 'In parallel, each bulb gets full voltage.',
      try: 'try_series',
      tryText: 'Try connecting bulbs in series instead.',
    }
  }
  if (key === 'switch') {
    return {
      explain: 'explain_open',
      explainText: 'The open switch breaks the circuit.',
      try: 'try_switch',
      tryText: 'Try closing the switch to complete the circuit.',
    }
  }
  if (key === 'resistor') {
    return {
      explain: 'explain_resistor',
      explainText: 'The resistor limits current, so the bulb is dim.',
      try: 'try_series',
      tryText: 'Try connecting bulbs in series instead.',
    }
  }

  // Dynamic analysis for custom or user-built circuits
  if (result.errors.includes('short_circuit')) {
    return {
      explain: 'explain_short',
      explainText: 'A wire directly across the battery is a short circuit — dangerous!',
      try: 'try_series',
      tryText: 'Connect bulbs in series or parallel across the battery.',
    }
  }
  if (desc.topology === 'incomplete' || !result.ok) {
    if (desc.counts.switch > 0) {
      return {
        explain: 'explain_open',
        explainText: 'The open switch breaks the circuit.',
        try: 'try_switch',
        tryText: 'Try closing the switch to complete the circuit.',
      }
    }
    return {
      explain: 'explain_open',
      explainText: 'The circuit is incomplete — no complete loop back to the battery.',
      try: 'try_series',
      tryText: 'Try connecting a complete closed loop.',
    }
  }
  if (desc.topology === 'parallel') {
    return {
      explain: 'explain_parallel',
      explainText: 'In parallel, each bulb gets full voltage.',
      try: 'try_series',
      tryText: 'Try connecting bulbs in series instead.',
    }
  }
  if (desc.counts.resistor > 0) {
    return {
      explain: 'explain_resistor',
      explainText: 'The resistor limits current, so the bulb is dim.',
      try: 'try_parallel',
      tryText: 'Try connecting bulbs in parallel instead.',
    }
  }
  return {
    explain: 'explain_series',
    explainText: 'In series, they share voltage and glow dim.',
    try: 'try_parallel',
    tryText: 'Try connecting bulbs in parallel instead.',
  }
}

/* ── Fault Hunt state ───────────────────────────────────────────── */
interface FaultState {
  puzzleIndex: number
  wrongTries: number
  phase: 'playing' | 'correct' | 'fixed'
  fixedNetlist?: Netlist
  fixedResult?: SolveResult
  lastTapped?: string
}

/* ── Main component ─────────────────────────────────────────────── */
export default function LearnScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const s = useLearnStrings()
  const [tab, setTab] = useState<'predict' | 'fault'>('predict')

  // Check if Build mode sent us a netlist
  const routeState = location.state as { netlist?: Netlist; mode?: string } | null
  const externalNetlist = routeState?.mode === 'predict' ? routeState.netlist : undefined

  // Stop any active audio clips when leaving the Learn screen
  useEffect(() => {
    return () => {
      stopAll()
    }
  }, [])

  const handleTabChange = useCallback((nextTab: 'predict' | 'fault') => {
    stopAll()
    setTab(nextTab)
  }, [])

  return (
    <>
      <style>{STYLES}</style>
      <main className="learn-screen">
        <header className="learn-header">
          <button className="back-btn" onClick={() => navigate('/')} aria-label="Go back to home">←</button>
          <h1 className="learn-title">Learn</h1>
        </header>

        {/* Tabs */}
        <div className="tab-row" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'predict'}
            className={`tab-btn ${tab === 'predict' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('predict')}
          >
            {s.tab_predict}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'fault'}
            className={`tab-btn ${tab === 'fault' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('fault')}
          >
            {s.tab_fault}
          </button>
        </div>

        <div className="learn-content">
          {tab === 'predict' && (
            <PredictTab lang={lang} s={s} externalNetlist={externalNetlist} navigate={navigate} />
          )}
          {tab === 'fault' && (
            <FaultTab lang={lang} s={s} />
          )}
        </div>
      </main>
    </>
  )
}

/* ── Predict Tab ─────────────────────────────────────────────────── */

type LearnStr = ReturnType<typeof useLearnStrings>

interface PredictTabProps {
  lang: 'en' | 'kn'
  s: LearnStr
  externalNetlist?: Netlist
  navigate: ReturnType<typeof useNavigate>
}

type PredictPhase =
  | { kind: 'choose' }                    // picking a preset
  | { kind: 'question'; challengeKey: string; netlist: Netlist }
  | { kind: 'revealed'; challengeKey: string; netlist: Netlist; result: SolveResult; chosen: PredictOption; correct: boolean }

function PredictTab({ lang, s, externalNetlist, navigate }: PredictTabProps) {
  const [phase, setPhase] = useState<PredictPhase>(() =>
    externalNetlist
      ? { kind: 'question', challengeKey: 'custom', netlist: externalNetlist }
      : { kind: 'choose' },
  )
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const audioQueued = useRef(false)

  // Play question audio when entering question phase
  useEffect(() => {
    if (phase.kind !== 'question') return
    if (audioQueued.current) return
    audioQueued.current = true
    void playClip(lang, 'predict_question', s.predict_question)
    return () => { audioQueued.current = false }
  }, [phase.kind, lang, s.predict_question])

  const startChallenge = useCallback((key: string, netlist: Netlist) => {
    stopAll()
    audioQueued.current = false
    setPhase({ kind: 'question', challengeKey: key, netlist })
  }, [])

  const handleChoose = useCallback(
    async (chosen: PredictOption, challengeKey: string, netlist: Netlist) => {
      const result = solve(netlist)
      const actual = gradeResult(result, netlist)
      const correct = chosen === actual

      setScore((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
      }))

      setPhase({ kind: 'revealed', challengeKey, netlist, result, chosen, correct })

      const audio = challengeAudio(challengeKey, netlist, result)
      await playSequence(lang, [
        correct ? 'correct' : 'not_quite',
        audio.explain,
        audio.try,
      ])
    },
    [lang],
  )

  const tryAnother = useCallback(() => {
    stopAll()
    audioQueued.current = false
    setPhase({ kind: 'choose' })
  }, [])

  const optionKeys: PredictOption[] = ['both_bright', 'both_dim', 'one_each', 'both_off']
  const optionLabels: Record<PredictOption, string> = {
    both_bright: s.opt_both_bright,
    both_dim: s.opt_both_dim,
    one_each: s.opt_one_each,
    both_off: s.opt_both_off,
  }

  return (
    <>
      {/* Score */}
      <div className="score-row" aria-live="polite">
        <span className="score-label">{s.score_label}:</span>
        <span className="score-value">{score.correct} / {score.total}</span>
      </div>

      {phase.kind === 'choose' && (
        <section aria-label="Choose a challenge">
          <p className="section-hint">{s.predict_title}</p>
          <div className="challenge-grid">
            {PRESET_CHALLENGES.map(({ key, netlist }) => (
              <button
                key={key}
                className="challenge-card"
                onClick={() => startChallenge(key, netlist)}
              >
                <GlowCircuitSVG netlist={netlist} />
                <span className="challenge-label">
                  {s[`challenge_${key}` as keyof LearnStr] ?? key}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {phase.kind === 'question' && (
        <section aria-label="Predict question">
          <p className="section-hint">{s.predict_question}</p>
          <div className="circuit-center">
            <GlowCircuitSVG netlist={phase.netlist} />
          </div>
          <div className="option-grid">
            {optionKeys.map((opt) => (
              <button
                key={opt}
                className="option-btn"
                onClick={() => void handleChoose(opt, phase.challengeKey, phase.netlist)}
              >
                {optionLabels[opt]}
              </button>
            ))}
          </div>
        </section>
      )}

      {phase.kind === 'revealed' && (
        <RevealedView
          phase={phase}
          s={s}
          lang={lang}
          optionLabels={optionLabels}
          onTryAnother={tryAnother}
          onOpenBuild={() => navigate('/build', { state: { netlist: phase.netlist } })}
        />
      )}
    </>
  )
}

interface RevealedViewProps {
  phase: Extract<PredictPhase, { kind: 'revealed' }>
  s: LearnStr
  lang: 'en' | 'kn'
  optionLabels: Record<PredictOption, string>
  onTryAnother: () => void
  onOpenBuild: () => void
}

function RevealedView({ phase, s, optionLabels, onTryAnother, onOpenBuild }: RevealedViewProps) {
  const audio = challengeAudio(phase.challengeKey, phase.netlist, phase.result)
  const explanationKey = `explain_${phase.challengeKey}` as keyof LearnStr
  const explanationText = (s[explanationKey] as string | undefined) ?? audio.explainText

  return (
    <section aria-label="Result" aria-live="polite">
      <div className={`result-banner ${phase.correct ? 'banner-correct' : 'banner-wrong'}`} role="status">
        {phase.correct ? s.correct_msg : s.wrong_msg}
      </div>

      <div className="circuit-center">
        <GlowCircuitSVG
          netlist={phase.netlist}
          solveResult={phase.result}
          revealed={true}
        />
      </div>

      <div className="chosen-row">
        <span className="chosen-label">Your answer:</span>
        <span className={`chosen-value ${phase.correct ? 'correct-text' : 'wrong-text'}`}>
          {optionLabels[phase.chosen]}
        </span>
      </div>

      <div className="explain-box">
        <p className="explain-text">{explanationText}</p>
      </div>

      <div className="action-row">
        <button className="btn-primary" onClick={onTryAnother}>{s.try_another}</button>
        <button className="btn-secondary" onClick={onOpenBuild}>{s.open_build}</button>
      </div>
    </section>
  )
}

/* ── Fault Hunt Tab ──────────────────────────────────────────────── */

interface FaultTabProps {
  lang: 'en' | 'kn'
  s: LearnStr
}

function FaultTab({ lang, s }: FaultTabProps) {
  const [state, setState] = useState<FaultState>({
    puzzleIndex: 0,
    wrongTries: 0,
    phase: 'playing',
  })
  const introPlayed = useRef(false)

  const puzzle = FAULT_PUZZLES[state.puzzleIndex]

  // Play intro + prompt when puzzle starts
  useEffect(() => {
    if (state.phase !== 'playing') return
    if (introPlayed.current) return
    introPlayed.current = true
    void playSequence(lang, ['fault_intro', puzzle.promptClip])
  }, [state.puzzleIndex, state.phase, lang, puzzle.promptClip])

  const handleTap = useCallback(
    async (componentId: string) => {
      if (state.phase !== 'playing') return

      const isCorrect = componentId === puzzle.faultyId

      if (isCorrect) {
        // Goal check: run solve() and describeCircuit() on the fixed netlist
        const fixedResult = solve(puzzle.fixedNetlist)
        const fixedDesc = describeCircuit(puzzle.fixedNetlist)
        const isGoalMet =
          fixedResult.ok && fixedDesc.topology !== 'incomplete' && fixedDesc.topology !== 'empty'

        if (isGoalMet) {
          setState((prev) => ({
            ...prev,
            phase: 'correct',
            fixedNetlist: puzzle.fixedNetlist,
            fixedResult,
            lastTapped: componentId,
          }))
          await playClip(lang, 'fault_correct', s.fault_correct)
          await playClip(lang, 'fault_fixed', s.fault_fixed)
          setState((prev) => ({ ...prev, phase: 'fixed' }))
        }
      } else {
        const newWrong = state.wrongTries + 1
        setState((prev) => ({ ...prev, wrongTries: newWrong, lastTapped: componentId }))
        await playClip(lang, 'fault_wrong', s.fault_wrong)
        if (newWrong >= 2) {
          await playClip(lang, 'fault_hint', puzzle.hintText)
        }
      }
    },
    [state, puzzle, lang, s],
  )

  const nextPuzzle = useCallback(() => {
    stopAll()
    introPlayed.current = false
    setState({
      puzzleIndex: (state.puzzleIndex + 1) % FAULT_PUZZLES.length,
      wrongTries: 0,
      phase: 'playing',
    })
  }, [state.puzzleIndex])

  const displayNetlist =
    state.phase === 'fixed' && state.fixedNetlist ? state.fixedNetlist : puzzle.brokenNetlist

  return (
    <section aria-label={s.fault_title}>
      <p className="section-hint">{s.fault_intro}</p>

      <div className="circuit-center">
        <GlowCircuitSVG
          netlist={displayNetlist}
          solveResult={state.phase === 'fixed' ? state.fixedResult : undefined}
          revealed={state.phase === 'fixed'}
          highlightId={
            state.phase === 'playing' && state.lastTapped && state.lastTapped !== puzzle.faultyId
              ? state.lastTapped
              : undefined
          }
          onComponentTap={state.phase === 'playing' ? (id) => void handleTap(id) : undefined}
        />
      </div>

      {state.phase === 'playing' && (
        <>
          {state.wrongTries > 0 && (
            <div className="fault-feedback fault-wrong-msg" role="alert">
              {s.fault_wrong}
              {state.wrongTries >= 2 && (
                <span className="hint-inline"> {puzzle.hintText}</span>
              )}
            </div>
          )}
          <p className="tap-instruction">👆 Tap the broken part</p>
        </>
      )}

      {state.phase === 'correct' && (
        <div className="fault-feedback fault-correct-msg" role="status" aria-live="polite">
          {s.fault_correct}
        </div>
      )}

      {state.phase === 'fixed' && (
        <>
          <div className="fault-feedback fault-fixed-msg" role="status" aria-live="polite">
            {s.fault_fixed}
          </div>
          <div className="action-row" style={{ marginTop: '16px' }}>
            <button className="btn-primary" onClick={nextPuzzle}>
              {s.try_another}
            </button>
          </div>
        </>
      )}

      {/* Puzzle indicator */}
      <div className="puzzle-dots" aria-label={`Puzzle ${state.puzzleIndex + 1} of ${FAULT_PUZZLES.length}`}>
        {FAULT_PUZZLES.map((_, i) => (
          <span key={i} className={`dot ${i === state.puzzleIndex ? 'dot-active' : ''}`} />
        ))}
      </div>
    </section>
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

  .learn-screen {
    min-height: 100vh;
    background: var(--clr-navy);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 48px;
    box-sizing: border-box;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }

  .learn-header {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin-bottom: 24px;
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

  .learn-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
  }

  /* Tabs */
  .tab-row {
    display: flex;
    gap: 0;
    width: 100%;
    background: var(--clr-surface);
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 24px;
    box-sizing: border-box;
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 1rem;
    font-weight: 600;
    padding: 12px 8px;
    cursor: pointer;
    border-radius: 10px;
    transition: background var(--transition), color var(--transition);
    min-height: 48px;
  }
  .tab-btn.tab-active {
    background: var(--clr-accent);
    color: var(--clr-navy);
  }
  .tab-btn:hover:not(.tab-active) {
    background: var(--clr-surface-hover);
    color: #fff;
  }

  .learn-content {
    width: 100%;
  }

  /* Score */
  .score-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 0.9rem;
  }
  .score-label { color: rgba(255,255,255,0.5); }
  .score-value { font-weight: 700; color: var(--clr-gold); }

  /* Challenge grid */
  .section-hint {
    font-size: 1rem;
    color: rgba(255,255,255,0.7);
    margin-bottom: 16px;
    text-align: center;
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
  }

  .challenge-card {
    background: var(--clr-surface);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--radius);
    padding: 12px 8px 16px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    transition: background var(--transition), transform var(--transition);
    min-height: 120px;
  }
  .challenge-card:hover, .challenge-card:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }
  .challenge-card:active { transform: scale(0.97); }

  .challenge-label {
    font-size: 0.82rem;
    color: rgba(255,255,255,0.7);
    text-align: center;
  }

  /* Circuit display */
  .circuit-center {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  /* Option grid */
  .option-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
    margin-top: 16px;
  }

  .option-btn {
    background: var(--clr-surface);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: var(--radius);
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    padding: 20px 12px;
    cursor: pointer;
    min-height: 72px;
    transition: background var(--transition), transform var(--transition);
    text-align: center;
  }
  .option-btn:hover, .option-btn:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }
  .option-btn:active { transform: scale(0.97); }

  /* Result reveal */
  .result-banner {
    border-radius: var(--radius);
    padding: 16px 20px;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 16px;
  }
  .banner-correct {
    background: rgba(102,187,106,0.18);
    border: 1px solid var(--clr-success);
    color: var(--clr-success);
  }
  .banner-wrong {
    background: rgba(239,83,80,0.12);
    border: 1px solid var(--clr-error);
    color: #fff;
  }

  .chosen-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 0.95rem;
  }
  .chosen-label { color: rgba(255,255,255,0.5); }
  .correct-text { color: var(--clr-success); font-weight: 700; }
  .wrong-text   { color: var(--clr-error);   font-weight: 700; }

  .explain-box {
    background: var(--clr-surface);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .explain-text {
    font-size: 0.95rem;
    color: rgba(255,255,255,0.85);
    margin: 0;
    line-height: 1.5;
  }

  /* Buttons */
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

  /* Fault Hunt */
  .fault-feedback {
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 1rem;
    font-weight: 600;
    text-align: center;
    margin-bottom: 12px;
  }
  .fault-wrong-msg {
    background: rgba(239,83,80,0.12);
    border: 1px solid var(--clr-error);
    color: #fff;
  }
  .fault-correct-msg {
    background: rgba(102,187,106,0.18);
    border: 1px solid var(--clr-success);
    color: var(--clr-success);
  }
  .fault-fixed-msg {
    background: rgba(79,195,247,0.12);
    border: 1px solid var(--clr-accent);
    color: var(--clr-accent);
  }

  .hint-inline {
    display: block;
    font-size: 0.88rem;
    font-weight: 400;
    color: rgba(255,255,255,0.6);
    margin-top: 6px;
  }

  .tap-instruction {
    text-align: center;
    color: rgba(255,255,255,0.5);
    font-size: 0.9rem;
    margin-top: 4px;
  }

  /* Puzzle dots */
  .puzzle-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 24px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.25);
    transition: background var(--transition);
  }
  .dot-active { background: var(--clr-accent); }
`
