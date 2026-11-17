/**
 * src/learn/index.tsx — Learn screen: home (two mode cards) + Predict game + Fault Hunt game
 *
 * Learn home:
 *  - Two big cards, "Predict" and "Fault Hunt", each showing a best score read from
 *    localStorage.
 *
 * Predict game:
 *  - 10 pre-authored questions from content/puzzles/predict.ts (every answer is
 *    cross-checked against solve() in content/puzzles/puzzles.test.ts).
 *  - Ask → choose → reveal (run solve, glow bulbs, show why) → next.
 *  - 1 point per question, correct on the first (only) choice. End screen with score,
 *    stars, and the thinking skills practised.
 *
 * Fault Hunt game:
 *  - 10 pre-authored puzzles from content/puzzles/faults.ts.
 *  - Tap the broken component → correct (swap in the fixed netlist, re-solve) or wrong
 *    (show why, hint after 2 wrong taps). 1 point if the very first tap was correct.
 *
 * Predict-from-Build (unscored):
 *  - Build mode can route here with router state { netlist, mode: 'predict' } carrying
 *    the student's own circuit. Shown as a single, ungraded question using
 *    describeCircuit() + SolveResult for dynamic structural feedback (gradeResult /
 *    challengeAudio below), since there is no pre-authored answer for an arbitrary
 *    user-built circuit.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { describeCircuit } from '../physics/describe'
import { playClip, playSequence, stopAll } from '../audio'
import { useLanguage } from '../app/lang'
import { useLearnStrings } from './useLearnStrings'
import GlowCircuitSVG from './GlowCircuitSVG'
import { PREDICT_QUESTIONS } from '../../content/puzzles/predict'
import { FAULT_QUESTIONS } from '../../content/puzzles/faults'
import type { SkillKey } from '../../content/puzzles/types'

type LearnStr = ReturnType<typeof useLearnStrings>

const BEST_PREDICT_KEY = 'pahunch_learn_best_predict'
const BEST_FAULT_KEY = 'pahunch_learn_best_fault'

function readBestScore(key: string): number {
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function saveBestScore(key: string, score: number): void {
  try {
    if (score > readBestScore(key)) window.localStorage.setItem(key, String(score))
  } catch { /* localStorage may be unavailable (private mode, quota) */ }
}

function starsFor(score: number): number {
  if (score >= 9) return 3
  if (score >= 6) return 2
  if (score >= 3) return 1
  return 0
}

function skillLabel(s: LearnStr, skill: SkillKey): string {
  return (s[`skill_${skill}` as keyof LearnStr] as unknown as string) ?? skill
}

/* ── Predict-from-Build (custom, unscored) ──────────────────────── */

export type PredictOption = 'both_bright' | 'both_dim' | 'one_each' | 'both_off'

/** Evaluates circuit outcome for an arbitrary (not pre-authored) netlist. */
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
    const st = bulbs[0].state
    if (st === 'bright' || st === 'normal') return 'both_bright'
    if (st === 'dim') return 'both_dim'
    return 'both_off'
  }
  const states = bulbs.map((b) => b.state)
  const allOff = states.every((st) => st === 'off')
  if (allOff) return 'both_off'
  const allBright = states.every((st) => st === 'bright' || st === 'normal')
  if (allBright) return 'both_bright'
  const allDim = states.every((st) => st === 'dim')
  if (allDim) return 'both_dim'
  return 'one_each'
}

/** Dynamic structural explanation for an arbitrary (not pre-authored) netlist. */
export function challengeAudio(
  netlist: Netlist,
  result: SolveResult,
): { explain: string; explainText: string; try: string; tryText: string } {
  const desc = describeCircuit(netlist)

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

type CustomPhase =
  | { kind: 'question' }
  | { kind: 'revealed'; result: SolveResult; chosen: PredictOption; correct: boolean }

function CustomPredict({
  lang,
  s,
  netlist,
  onDone,
  navigate,
}: {
  lang: 'en' | 'kn'
  s: LearnStr
  netlist: Netlist
  onDone: () => void
  navigate: ReturnType<typeof useNavigate>
}) {
  const [phase, setPhase] = useState<CustomPhase>({ kind: 'question' })
  const audioQueued = useRef(false)

  useEffect(() => {
    if (phase.kind !== 'question') return
    if (audioQueued.current) return
    audioQueued.current = true
    void playClip(lang, 'predict_question', s.predict_question)
  }, [phase.kind, lang, s.predict_question])

  const handleChoose = useCallback(
    async (chosen: PredictOption) => {
      const result = solve(netlist)
      const actual = gradeResult(result, netlist)
      const correct = chosen === actual
      setPhase({ kind: 'revealed', result, chosen, correct })
      const audio = challengeAudio(netlist, result)
      await playSequence(lang, [correct ? 'correct' : 'not_quite', audio.explain, audio.try])
    },
    [lang, netlist],
  )

  const optionKeys: PredictOption[] = ['both_bright', 'both_dim', 'one_each', 'both_off']
  const optionLabels: Record<PredictOption, string> = {
    both_bright: s.opt_both_bright,
    both_dim: s.opt_both_dim,
    one_each: s.opt_one_each,
    both_off: s.opt_both_off,
  }

  if (phase.kind === 'question') {
    return (
      <section aria-label="Predict question">
        <p className="section-hint">{s.predict_question}</p>
        <div className="circuit-center">
          <GlowCircuitSVG netlist={netlist} />
        </div>
        <div className="option-grid">
          {optionKeys.map((opt) => (
            <button key={opt} className="option-btn" onClick={() => void handleChoose(opt)}>
              {optionLabels[opt]}
            </button>
          ))}
        </div>
      </section>
    )
  }

  const audio = challengeAudio(netlist, phase.result)
  return (
    <section aria-label="Result" aria-live="polite">
      <div className={`result-banner ${phase.correct ? 'banner-correct' : 'banner-wrong'}`} role="status">
        {phase.correct ? s.correct_msg : s.wrong_msg}
      </div>
      <div className="circuit-center">
        <GlowCircuitSVG netlist={netlist} solveResult={phase.result} revealed />
      </div>
      <div className="chosen-row">
        <span className="chosen-label">Your answer:</span>
        <span className={`chosen-value ${phase.correct ? 'correct-text' : 'wrong-text'}`}>
          {optionLabels[phase.chosen]}
        </span>
      </div>
      <div className="explain-box">
        <p className="explain-text">{audio.explainText}</p>
      </div>
      <div className="action-row">
        <button className="btn-primary" onClick={onDone}>{s.try_another}</button>
        <button className="btn-secondary" onClick={() => navigate('/build', { state: { netlist } })}>{s.open_build}</button>
      </div>
    </section>
  )
}

/* ── Shared progress / end-screen pieces ────────────────────────── */

function ProgressHeader({ s, index, total, score }: { s: LearnStr; index: number; total: number; score: number }) {
  const progressText = s.question_progress
    .replace('{n}', String(index + 1))
    .replace('{total}', String(total))
  return (
    <>
      <p className="section-hint">{progressText}</p>
      <div className="score-row" aria-live="polite">
        <span className="score-label">{s.score_label}:</span>
        <span className="score-value">{score} / {total}</span>
      </div>
    </>
  )
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="puzzle-dots" aria-label={`${current + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`dot ${i === current ? 'dot-active' : ''} ${i < current ? 'dot-done' : ''}`} />
      ))}
    </div>
  )
}

function EndScreen({
  s,
  score,
  total,
  skills,
  onTryAgain,
  switchLabel,
  onSwitch,
}: {
  s: LearnStr
  score: number
  total: number
  skills: SkillKey[]
  onTryAgain: () => void
  switchLabel: string
  onSwitch: () => void
}) {
  const stars = starsFor(score)
  return (
    <section aria-label="Results" aria-live="polite" className="end-screen">
      <p className="end-title">{s.end_title}</p>
      <p className="end-score">{score}/{total}</p>
      <p className="end-stars" aria-hidden="true">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</p>
      <p className="end-skills-label">{s.end_skills_label}</p>
      <div className="skill-pill-row">
        {skills.map((skill) => (
          <span key={skill} className="skill-pill">{skillLabel(s, skill)}</span>
        ))}
      </div>
      <div className="action-row">
        <button className="btn-primary" onClick={onTryAgain}>{s.try_again}</button>
        <button className="btn-secondary" onClick={onSwitch}>{switchLabel}</button>
      </div>
    </section>
  )
}

/* ── Predict game (10 questions, scored) ────────────────────────── */

interface PredictGameState {
  index: number
  score: number
  phase: 'question' | 'revealed' | 'end'
  chosenKey?: string
  result?: SolveResult
}

function PredictGame({
  lang,
  s,
  onSwitchToFault,
}: {
  lang: 'en' | 'kn'
  s: LearnStr
  onSwitchToFault: () => void
}) {
  const [state, setState] = useState<PredictGameState>({ index: 0, score: 0, phase: 'question' })
  const audioQueued = useRef(false)
  const question = PREDICT_QUESTIONS[state.index]

  useEffect(() => {
    if (state.phase !== 'question') return
    if (audioQueued.current) return
    audioQueued.current = true
    void playClip(lang, `predict_q_${question.id}`, question.question[lang])
  }, [state.phase, state.index, lang, question])

  const handleChoose = useCallback(
    async (optionKey: string) => {
      const result = solve(question.netlist)
      const correct = optionKey === question.correctKey
      setState((prev) => ({
        ...prev,
        phase: 'revealed',
        chosenKey: optionKey,
        result,
        score: prev.score + (correct ? 1 : 0),
      }))
      await playSequence(lang, [correct ? 'correct' : 'not_quite'], () => question.why[lang])
    },
    [lang, question],
  )

  const handleNext = useCallback(() => {
    stopAll()
    audioQueued.current = false
    setState((prev) => {
      const nextIndex = prev.index + 1
      if (nextIndex >= PREDICT_QUESTIONS.length) {
        saveBestScore(BEST_PREDICT_KEY, prev.score)
        return { ...prev, phase: 'end' }
      }
      return { index: nextIndex, score: prev.score, phase: 'question' }
    })
  }, [])

  const handleRestart = useCallback(() => {
    stopAll()
    audioQueued.current = false
    setState({ index: 0, score: 0, phase: 'question' })
  }, [])

  if (state.phase === 'end') {
    const skills = Array.from(new Set(PREDICT_QUESTIONS.map((q) => q.skill)))
    return (
      <EndScreen
        s={s}
        score={state.score}
        total={PREDICT_QUESTIONS.length}
        skills={skills}
        onTryAgain={handleRestart}
        switchLabel={s.go_to_fault}
        onSwitch={onSwitchToFault}
      />
    )
  }

  return (
    <section aria-label="Predict">
      <ProgressHeader s={s} index={state.index} total={PREDICT_QUESTIONS.length} score={state.score} />
      <p className="section-hint">{question.question[lang]}</p>
      <div className="circuit-center">
        <GlowCircuitSVG
          netlist={question.netlist}
          solveResult={state.phase === 'revealed' ? state.result : undefined}
          revealed={state.phase === 'revealed'}
        />
      </div>

      {state.phase === 'question' && (
        <div className="option-grid">
          {question.options.map((opt) => (
            <button key={opt.key} className="option-btn" onClick={() => void handleChoose(opt.key)}>
              {opt.text[lang]}
            </button>
          ))}
        </div>
      )}

      {state.phase === 'revealed' && (
        <>
          <div
            className={`result-banner ${state.chosenKey === question.correctKey ? 'banner-correct' : 'banner-wrong'}`}
            role="status"
          >
            {state.chosenKey === question.correctKey ? s.correct_msg : s.wrong_msg}
          </div>
          <div className="explain-box">
            <p className="explain-text">{question.why[lang]}</p>
          </div>
          <div className="action-row">
            <button className="btn-primary" onClick={handleNext}>{s.next_question}</button>
          </div>
        </>
      )}

      <ProgressDots total={PREDICT_QUESTIONS.length} current={state.index} />
    </section>
  )
}

/* ── Fault Hunt game (10 puzzles, scored) ───────────────────────── */

interface FaultGameState {
  index: number
  score: number
  wrongTries: number
  phase: 'playing' | 'fixed' | 'end'
  firstTapCorrect?: boolean
  lastTapped?: string
  fixedResult?: SolveResult
}

function FaultGame({
  lang,
  s,
  onSwitchToPredict,
}: {
  lang: 'en' | 'kn'
  s: LearnStr
  onSwitchToPredict: () => void
}) {
  const [state, setState] = useState<FaultGameState>({ index: 0, score: 0, wrongTries: 0, phase: 'playing' })
  const introPlayed = useRef(false)
  const question = FAULT_QUESTIONS[state.index]

  useEffect(() => {
    if (state.phase !== 'playing') return
    if (introPlayed.current) return
    introPlayed.current = true
    void playSequence(lang, ['fault_intro', `fault_q_${question.id}`], (name) =>
      name === 'fault_intro' ? s.fault_intro : question.prompt[lang],
    )
  }, [state.phase, state.index, lang, question, s.fault_intro])

  const handleTap = useCallback(
    async (componentId: string) => {
      if (state.phase !== 'playing') return
      const isCorrect = componentId === question.faultyId
      const lockedFirstTap = state.firstTapCorrect === undefined ? isCorrect : state.firstTapCorrect

      if (isCorrect) {
        const fixedResult = solve(question.fixedNetlist)
        setState((prev) => ({ ...prev, phase: 'fixed', lastTapped: componentId, firstTapCorrect: lockedFirstTap, fixedResult }))
        await playSequence(lang, ['fault_correct', 'fault_fixed'], (name) =>
          name === 'fault_correct' ? s.fault_correct : s.fault_fixed,
        )
      } else {
        const newWrong = state.wrongTries + 1
        setState((prev) => ({ ...prev, wrongTries: newWrong, lastTapped: componentId, firstTapCorrect: lockedFirstTap }))
        const clips = newWrong >= 2 ? ['fault_wrong', 'fault_hint'] : ['fault_wrong']
        await playSequence(lang, clips, (name) => (name === 'fault_wrong' ? s.fault_wrong : question.hint[lang]))
      }
    },
    [state, question, lang, s],
  )

  const handleNext = useCallback(() => {
    stopAll()
    introPlayed.current = false
    setState((prev) => {
      const earned = prev.firstTapCorrect === true ? 1 : 0
      const newScore = prev.score + earned
      const nextIndex = prev.index + 1
      if (nextIndex >= FAULT_QUESTIONS.length) {
        saveBestScore(BEST_FAULT_KEY, newScore)
        return { index: prev.index, score: newScore, wrongTries: 0, phase: 'end' }
      }
      return { index: nextIndex, score: newScore, wrongTries: 0, phase: 'playing' }
    })
  }, [])

  const handleRestart = useCallback(() => {
    stopAll()
    introPlayed.current = false
    setState({ index: 0, score: 0, wrongTries: 0, phase: 'playing' })
  }, [])

  if (state.phase === 'end') {
    const skills = Array.from(new Set(FAULT_QUESTIONS.map((q) => q.skill)))
    return (
      <EndScreen
        s={s}
        score={state.score}
        total={FAULT_QUESTIONS.length}
        skills={skills}
        onTryAgain={handleRestart}
        switchLabel={s.go_to_predict}
        onSwitch={onSwitchToPredict}
      />
    )
  }

  const displayNetlist = state.phase === 'fixed' ? question.fixedNetlist : question.brokenNetlist

  return (
    <section aria-label={s.fault_title}>
      <ProgressHeader s={s} index={state.index} total={FAULT_QUESTIONS.length} score={state.score} />
      <p className="section-hint">{question.prompt[lang]}</p>

      <div className="circuit-center">
        <GlowCircuitSVG
          netlist={displayNetlist}
          solveResult={state.phase === 'fixed' ? state.fixedResult : undefined}
          revealed={state.phase === 'fixed'}
          highlightId={
            state.phase === 'playing' && state.lastTapped && state.lastTapped !== question.faultyId
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
              {state.wrongTries >= 2 && <span className="hint-inline"> {question.hint[lang]}</span>}
            </div>
          )}
          <p className="tap-instruction">{s.tap_instruction}</p>
        </>
      )}

      {state.phase === 'fixed' && (
        <>
          <div className="fault-feedback fault-fixed-msg" role="status" aria-live="polite">{s.fault_fixed}</div>
          <div className="explain-box">
            <p className="explain-text">{question.why[lang]}</p>
          </div>
          <div className="action-row" style={{ marginTop: '16px' }}>
            <button className="btn-primary" onClick={handleNext}>{s.next_question}</button>
          </div>
        </>
      )}

      <ProgressDots total={FAULT_QUESTIONS.length} current={state.index} />
    </section>
  )
}

/* ── Learn home (two big cards) ─────────────────────────────────── */

function LearnHome({ s, onPredict, onFault }: { s: LearnStr; onPredict: () => void; onFault: () => void }) {
  const bestPredict = readBestScore(BEST_PREDICT_KEY)
  const bestFault = readBestScore(BEST_FAULT_KEY)
  return (
    <div className="learn-home-grid">
      <button className="learn-home-card" onClick={onPredict}>
        <span className="home-card-title">{s.tab_predict}</span>
        <span className="home-card-desc">{s.home_predict_desc}</span>
        <span className="home-card-best">{s.best_score_label}: {bestPredict}/10</span>
      </button>
      <button className="learn-home-card" onClick={onFault}>
        <span className="home-card-title">{s.tab_fault}</span>
        <span className="home-card-desc">{s.home_fault_desc}</span>
        <span className="home-card-best">{s.best_score_label}: {bestFault}/10</span>
      </button>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────── */

type LearnView =
  | { kind: 'home' }
  | { kind: 'predict-custom'; netlist: Netlist }
  | { kind: 'predict-game' }
  | { kind: 'fault-game' }

export default function LearnScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const s = useLearnStrings()
  const { lang } = useLanguage()

  const routeState = location.state as { netlist?: Netlist; mode?: string } | null
  const externalNetlist = routeState?.mode === 'predict' ? routeState.netlist : undefined

  const [view, setView] = useState<LearnView>(() =>
    externalNetlist ? { kind: 'predict-custom', netlist: externalNetlist } : { kind: 'home' },
  )

  useEffect(() => {
    return () => {
      stopAll()
    }
  }, [])

  const goHome = useCallback(() => {
    stopAll()
    setView({ kind: 'home' })
  }, [])

  return (
    <>
      <style>{STYLES}</style>
      <main className="learn-screen">
        <header className="learn-header">
          <button
            className="back-btn"
            onClick={() => (view.kind === 'home' ? navigate('/') : goHome())}
            aria-label="Go back"
          >
            ←
          </button>
          <h1 className="learn-title">Learn</h1>
        </header>

        <div className="learn-content">
          {view.kind === 'home' && (
            <LearnHome
              s={s}
              onPredict={() => { stopAll(); setView({ kind: 'predict-game' }) }}
              onFault={() => { stopAll(); setView({ kind: 'fault-game' }) }}
            />
          )}
          {view.kind === 'predict-custom' && (
            <CustomPredict lang={lang} s={s} netlist={view.netlist} onDone={goHome} navigate={navigate} />
          )}
          {view.kind === 'predict-game' && (
            <PredictGame lang={lang} s={s} onSwitchToFault={() => { stopAll(); setView({ kind: 'fault-game' }) }} />
          )}
          {view.kind === 'fault-game' && (
            <FaultGame lang={lang} s={s} onSwitchToPredict={() => { stopAll(); setView({ kind: 'predict-game' }) }} />
          )}
        </div>
      </main>
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

  .learn-screen {
    min-height: 100vh;
    background: transparent;
    color: var(--clr-cream);
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
    background: #0f0f0f;
    border: 2px solid var(--clr-cream);
    border-radius: 999px;
    padding: 4px;
    margin-bottom: 24px;
    box-sizing: border-box;
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    color: var(--clr-cream);
    font-size: 1rem;
    font-weight: 800;
    padding: 12px 8px;
    cursor: pointer;
    border-radius: 999px;
    transition: background var(--transition), color var(--transition);
    min-height: 48px;
  }
  .tab-btn.tab-active {
    background: var(--clr-gold);
    color: var(--clr-navy);
  }
  .tab-btn:hover:not(.tab-active) {
    background: var(--clr-surface-hover);
    color: #fff;
  }

  .learn-content {
    width: 100%;
    background: #0f0f0f;
    border: 2px solid var(--clr-cream);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.4);
    box-sizing: border-box;
  }

  /* Score */
  .score-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 0.9rem;
  }
  .score-label { color: rgba(241,230,207,0.5); }
  .score-value { font-weight: 700; color: var(--clr-gold); }

  /* Challenge grid */
  .section-hint {
    font-size: 1rem;
    color: rgba(241,230,207,0.7);
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
    background: #0f0f0f;
    border: 1px solid rgba(241,230,207,0.15);
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
  }
  .challenge-card:hover, .challenge-card:focus-visible {
    background: var(--clr-surface-hover);
    outline: 2px solid var(--clr-accent);
  }
  .challenge-card:active { transform: scale(0.97); }

  .challenge-label {
    font-size: 0.82rem;
    color: rgba(241,230,207,0.7);
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
    background: #0f0f0f;
    border: 2px solid var(--clr-cream);
    border-radius: var(--radius);
    color: var(--clr-cream);
    font-size: 1rem;
    font-weight: 800;
    padding: 20px 12px;
    cursor: pointer;
    min-height: 72px;
    transition: transform 120ms ease, box-shadow 120ms ease;
    text-align: center;
  }
  .option-btn:hover, .option-btn:focus-visible {
    box-shadow: 6px 6px 0 var(--clr-gold);
    outline: 2px solid var(--clr-gold);
    transform: translate(-2px, -2px);
  }
  .option-btn:active { transform: translateY(2px); box-shadow: none; }

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
    background: rgba(47,143,136,0.18);
    border: 1px solid var(--clr-success);
    color: var(--clr-success);
  }
  .banner-wrong {
    background: rgba(212,69,43,0.12);
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
  .chosen-label { color: rgba(241,230,207,0.5); }
  .correct-text { color: var(--clr-success); font-weight: 700; }
  .wrong-text   { color: var(--clr-error);   font-weight: 700; }

  .explain-box {
    background: #0f0f0f;
    border: 1px solid rgba(241,230,207,0.15);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .explain-text {
    font-size: 0.95rem;
    color: rgba(241,230,207,0.85);
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
    background: rgba(212,69,43,0.12);
    border: 1px solid var(--clr-error);
    color: #fff;
  }
  .fault-correct-msg {
    background: rgba(47,143,136,0.18);
    border: 1px solid var(--clr-success);
    color: var(--clr-success);
  }
  .fault-fixed-msg {
    background: rgba(47,143,136,0.12);
    border: 1px solid var(--clr-accent);
    color: var(--clr-accent);
  }

  .hint-inline {
    display: block;
    font-size: 0.88rem;
    font-weight: 400;
    color: rgba(241,230,207,0.6);
    margin-top: 6px;
  }

  .tap-instruction {
    text-align: center;
    color: rgba(241,230,207,0.5);
    font-size: 0.9rem;
    margin-top: 4px;
  }

  /* Puzzle dots */
  .puzzle-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 24px;
    flex-wrap: wrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(241,230,207,0.25);
    transition: background var(--transition);
  }
  .dot-active { background: var(--clr-gold); }
  .dot-done { background: var(--clr-accent); }

  /* Learn home — two big mode cards */
  .learn-home-grid {
    display: grid;
    gap: 14px;
    width: 100%;
  }
  .learn-home-card {
    background: var(--clr-surface);
    border: 2px solid var(--clr-cream);
    border-radius: var(--radius);
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    cursor: pointer;
    min-height: 96px;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .learn-home-card:hover, .learn-home-card:focus-visible {
    box-shadow: 6px 6px 0 var(--clr-gold);
    outline: 2px solid var(--clr-gold);
    transform: translate(-2px, -2px);
  }
  .learn-home-card:active { transform: translateY(2px); box-shadow: none; }
  .home-card-title { font-size: 1.2rem; font-weight: 800; color: var(--clr-cream); }
  .home-card-desc { font-size: 0.88rem; color: rgba(241,230,207,0.65); }
  .home-card-best { font-size: 0.85rem; font-weight: 700; color: var(--clr-gold); margin-top: 4px; }

  /* End screen */
  .end-screen { text-align: center; }
  .end-title { font-size: 1.3rem; font-weight: 800; color: var(--clr-cream); margin: 0 0 4px; }
  .end-score { font-size: 2.6rem; font-weight: 800; color: var(--clr-gold); margin: 0 0 4px; }
  .end-stars { font-size: 1.8rem; letter-spacing: 4px; color: var(--clr-gold); margin: 0 0 20px; }
  .end-skills-label { font-size: 0.9rem; color: rgba(241,230,207,0.6); margin: 0 0 10px; }
  .skill-pill-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-bottom: 22px;
  }
  .skill-pill {
    background: var(--clr-surface);
    border: 1px solid rgba(241,230,207,0.25);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.78rem;
    color: var(--clr-cream);
  }
`
