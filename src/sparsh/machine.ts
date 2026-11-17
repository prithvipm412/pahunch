import type { CircuitComponent, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { describeCircuit } from '../physics/describe'
import { DEFAULT_BATTERY_VOLTAGE, DEFAULT_RESISTOR_RESISTANCE } from '../physics/constants'
import { classifyCircuitStatus, type CircuitStatus } from '../audio/feedbackSounds'
import { hapticDurationMs, hapticForCircuitStatus, type HapticName } from '../audio/haptics'
import {
  alreadyClipFor,
  BATTERY_VALUES,
  countClipFor,
  ohmsClipFor,
  partClipFor,
  posClipFor,
  voltsClipFor,
  PART_MENU_ORDER,
  RESISTOR_VALUES,
  type ClipName,
} from './clips'
import { PICKER_ORDER } from './gestureMap'

export const GRID_SIZE = 5

export type Direction = 'up' | 'down' | 'left' | 'right'

export type Mode = 'build' | 'explore'

// 'idle': cursor swipes move around the grid. 'partChosen': the student has opened the part
// picker (via 1-finger double-tap — see SparshEvent, and gestureMap.ts's PICKER_ORDER) and the
// next swipe places it from the cursor to the neighbouring dot in that direction.
export type BuildSubMode = { kind: 'idle' } | { kind: 'partChosen'; partType: ComponentType }

export interface ExploreState {
  point: GridPoint
  overComponentId: string | null
}

// The guided lesson (Phase 3): build 1 battery + 2 bulbs in series, run it, then rebuild the
// same two bulbs in parallel and run again. 'series'/'parallel' are the building phases
// (stepIndex tracks progress within SERIES_STEP_CLIPS / the single parallel step);
// 'seriesRun'/'parallelRun' mean the build is done and we're waiting for a two-finger tap.
export type LessonPhase = 'series' | 'seriesRun' | 'parallel' | 'parallelRun'

export interface LessonState {
  phase: LessonPhase
  stepIndex: number
}

// A snapshot taken BEFORE a placement/removal/toggle, so 2-finger-swipe-right can restore it.
// `undoneClips` is precomputed at push time — the clips describing what reverting *to* this
// snapshot undoes (e.g. placing a bulb is undone by "removed, bulb"; removing one is undone by
// "bulb, is back"; toggling a switch is undone by announcing the state it reverts to).
export interface HistoryEntry {
  netlist: Netlist
  cursor: GridPoint
  undoneClips: ClipName[]
}

export interface SparshState {
  mode: Mode
  cursor: GridPoint
  netlist: Netlist
  buildSub: BuildSubMode
  explore: ExploreState | null
  lastResult: SolveResult | null
  nextId: number
  lesson: LessonState | null
  history: HistoryEntry[]
  // Timestamp (caller-supplied, via SWIPE_LEFT's `now`) of the most recent un-confirmed
  // 2-finger-swipe-left, or null. A second swipe-left within EXIT_CONFIRM_WINDOW_MS confirms the
  // exit; the field is never explicitly "expired" — an old timestamp just naturally fails the
  // window check on the next swipe-left, so it's treated as a fresh first swipe.
  pendingExitAt: number | null
}

export type SparshEvent =
  | { type: 'INIT' }
  | { type: 'SWIPE'; direction: Direction }
  | { type: 'SINGLE_TAP' } // one-finger tap, confirmed not to be the first half of a double-tap
  | { type: 'DOUBLE_TAP' } // one-finger double-tap: advance the part picker, or toggle a switch
  | { type: 'HOLD' } // one-finger press held >= 600ms without moving: cancel the part picker
  | { type: 'PICKER_IDLE_TIMEOUT' } // no picker-relevant gesture for 10s: close it, same as HOLD
  | { type: 'TWO_FINGER_TAP' }
  | { type: 'TWO_FINGER_HOLD' }
  | { type: 'TWO_FINGER_SWIPE_DOWN' }
  | { type: 'TWO_FINGER_SWIPE_UP' }
  | { type: 'TWO_FINGER_SWIPE_RIGHT' } // undo
  | { type: 'TWO_FINGER_DOUBLE_TAP' }
  | { type: 'TWO_FINGER_SWIPE_LEFT'; now: number } // home, with a 2nd-swipe-within-3s confirmation
  | { type: 'THREE_FINGER_TAP' }
  | { type: 'BACK_INTERCEPTED' } // browser/hardware Back was caught instead of leaving
  | { type: 'SOLVE_RESULT'; result: SolveResult }
  | { type: 'DRAG'; point: GridPoint }
  | { type: 'REST'; point: GridPoint }

export type SparshEffect =
  | { type: 'speak'; clips: ClipName[] }
  // A named pattern from src/audio/haptics.ts — index.tsx fires it with `essential: true`
  // (Sparsh's vibration is a primary feedback channel, not a decorative flourish, so it's
  // never suppressed by prefers-reduced-motion).
  | { type: 'haptic'; name: HapticName }
  // Circuit status after a solve(): drives BOTH the haptic (via hapticForCircuitStatus) and the
  // matching synthesized sound (via playCircuitStatusSound) — kept as one effect so the two
  // always agree on which bucket a result landed in.
  | { type: 'circuitStatus'; status: CircuitStatus }
  | { type: 'solve' }
  | { type: 'sonifyStart'; result: SolveResult }
  | { type: 'sonifyStop' }
  | { type: 'stopAll' }
  | { type: 'navigateHome' }
  // Lets a successful run's status sound/haptic land first, with the continuous sonify() tone
  // starting ~0.8s later so the two signals don't clash.
  | { type: 'delay'; ms: number }

export interface SparshTransition {
  state: SparshState
  effects: SparshEffect[]
}

const MAX_HISTORY = 50
const EXIT_CONFIRM_WINDOW_MS = 3000

// Never vibrate while speech is starting: every haptic that's immediately followed by speech
// fires FIRST, then a delay sized to that pattern's own duration (+ this small buffer) runs
// before the words begin — real devices were observed glitching/clipping speech that started
// while the vibration motor was still running.
const SPEECH_AFTER_HAPTIC_MS = 60

// Each part's own "place" haptic signature (src/audio/haptics.ts). Fired both the moment a part
// is actually placed, and on every double-tap that lands on it in the picker (see
// advancePicker() below) — a blind student feels *which* part is current without waiting for
// speech, and placement reuses the exact same signature they just heard/felt while choosing it.
const PLACE_HAPTIC: Record<ComponentType, HapticName> = {
  wire: 'place_wire',
  battery: 'place_battery',
  bulb: 'place_bulb',
  resistor: 'place_resistor',
  switch: 'place_switch',
}

// haptic, then (once its pattern finishes + a small buffer) the speech — see SPEECH_AFTER_HAPTIC_MS.
function hapticThenSpeak(name: HapticName, clips: ClipName[]): SparshEffect[] {
  return [
    { type: 'haptic', name },
    { type: 'delay', ms: hapticDurationMs(name) + SPEECH_AFTER_HAPTIC_MS },
    { type: 'speak', clips },
  ]
}

export function createInitialState(gridSize: number = GRID_SIZE): SparshState {
  return {
    mode: 'build',
    cursor: { row: 0, col: 0 },
    netlist: { gridSize, components: [], source: 'sparsh' },
    buildSub: { kind: 'idle' },
    explore: null,
    lastResult: null,
    nextId: 1,
    lesson: null,
    history: [],
    pendingExitAt: null,
  }
}

const SERIES_STEP_CLIPS: ClipName[][] = [
  ['lesson_step_battery'],
  ['lesson_step_bulb1'],
  ['lesson_step_bulb2'],
  ['lesson_step_close_loop'],
]

const PARALLEL_STEP_CLIPS: ClipName[][] = [['lesson_parallel_intro']]

function isSeriesStepComplete(stepIndex: number, netlist: Netlist): boolean {
  const { counts, topology } = describeCircuit(netlist)
  if (stepIndex === 0) return counts.battery >= 1
  if (stepIndex === 1) return counts.bulb >= 1
  if (stepIndex === 2) return counts.bulb >= 2
  return topology === 'series' && counts.bulb >= 2 && counts.battery >= 1
}

function isParallelStepComplete(netlist: Netlist): boolean {
  const { counts, topology } = describeCircuit(netlist)
  return topology === 'parallel' && counts.bulb >= 2 && counts.battery >= 1
}

// After an undo restores an earlier netlist, the lesson's phase/stepIndex (which only ever
// moved forward as the student built) can be ahead of what that netlist actually supports. This
// re-derives the current step from scratch, within whichever phase family (series or parallel)
// the lesson is already in — it never jumps back from 'parallel' to 'series', since undo is only
// ever used for a mistake a step or two back, not to rewind across a whole run checkpoint.
function recomputeLessonAfterUndo(lesson: LessonState, netlist: Netlist): LessonState {
  if (lesson.phase === 'parallel' || lesson.phase === 'parallelRun') {
    return isParallelStepComplete(netlist) ? { phase: 'parallelRun', stepIndex: 0 } : { phase: 'parallel', stepIndex: 0 }
  }
  let stepIndex = 0
  while (stepIndex < SERIES_STEP_CLIPS.length && isSeriesStepComplete(stepIndex, netlist)) stepIndex++
  return stepIndex >= SERIES_STEP_CLIPS.length ? { phase: 'seriesRun', stepIndex: 0 } : { phase: 'series', stepIndex }
}

// Re-checks the active lesson step against the (possibly just-edited) netlist and advances as
// far as it can — looping lets an out-of-order build (e.g. placing both bulbs before the
// battery) cascade through every step it already satisfies in one go. Returns extra speak
// effects to append to whatever the triggering transition already produced.
function advanceLesson(state: SparshState): SparshTransition {
  let current = state
  const effects: SparshEffect[] = []

  for (;;) {
    const lesson = current.lesson
    if (!lesson) break

    if (lesson.phase === 'series') {
      if (!isSeriesStepComplete(lesson.stepIndex, current.netlist)) break
      const nextStepIndex = lesson.stepIndex + 1
      if (nextStepIndex < SERIES_STEP_CLIPS.length) {
        current = { ...current, lesson: { phase: 'series', stepIndex: nextStepIndex } }
        effects.push({ type: 'speak', clips: ['lesson_good', ...SERIES_STEP_CLIPS[nextStepIndex]] })
        continue
      }
      current = { ...current, lesson: { phase: 'seriesRun', stepIndex: 0 } }
      effects.push({ type: 'speak', clips: ['lesson_good', 'lesson_series_ready'] })
      break
    }

    if (lesson.phase === 'parallel') {
      if (!isParallelStepComplete(current.netlist)) break
      current = { ...current, lesson: { phase: 'parallelRun', stepIndex: 0 } }
      effects.push({ type: 'speak', clips: ['lesson_good', 'lesson_parallel_ready'] })
      break
    }

    break
  }

  return { state: current, effects }
}

// Wraps a transition that may have changed the netlist: if a lesson is active, checks whether
// that edit completed its current step and appends any resulting lesson speech.
function withLessonCheck(transition: SparshTransition): SparshTransition {
  if (!transition.state.lesson) return transition
  const advanced = advanceLesson(transition.state)
  return { state: advanced.state, effects: [...transition.effects, ...advanced.effects] }
}

function pointsEqual(a: GridPoint, b: GridPoint): boolean {
  return a.row === b.row && a.col === b.col
}

function neighborInDirection(point: GridPoint, direction: Direction, gridSize: number): GridPoint | null {
  const next =
    direction === 'up'
      ? { row: point.row - 1, col: point.col }
      : direction === 'down'
        ? { row: point.row + 1, col: point.col }
        : direction === 'left'
          ? { row: point.row, col: point.col - 1 }
          : { row: point.row, col: point.col + 1 }
  if (next.row < 0 || next.row >= gridSize || next.col < 0 || next.col >= gridSize) return null
  return next
}

function findComponentAt(netlist: Netlist, point: GridPoint): CircuitComponent | undefined {
  return netlist.components.find((c) => pointsEqual(c.from, point) || pointsEqual(c.to, point))
}

// The *most recently placed* component touching `point` — used by the 2-finger-swipe-down
// remove gesture, since netlist.components is append-ordered.
function findLatestComponentAt(netlist: Netlist, point: GridPoint): CircuitComponent | undefined {
  for (let i = netlist.components.length - 1; i >= 0; i--) {
    const c = netlist.components[i]
    if (pointsEqual(c.from, point) || pointsEqual(c.to, point)) return c
  }
  return undefined
}

// The component already occupying segment a-b, if any — used by handlePlacement to both check
// occupancy and name which part is in the way.
function findSegmentComponent(netlist: Netlist, a: GridPoint, b: GridPoint): CircuitComponent | undefined {
  return netlist.components.find(
    (c) => (pointsEqual(c.from, a) && pointsEqual(c.to, b)) || (pointsEqual(c.from, b) && pointsEqual(c.to, a)),
  )
}

// Snapshots `state` (before a placement/removal/toggle) onto the history stack, capped at
// MAX_HISTORY. Moving the cursor, and choosing/cancelling a part, never call this — only an
// actual netlist change does.
function pushHistory(state: SparshState, undoneClips: ClipName[]): HistoryEntry[] {
  const entry: HistoryEntry = { netlist: state.netlist, cursor: state.cursor, undoneClips }
  const next = [...state.history, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

function stateClipFor(state: SolveResult['components'][number]['state']): ClipName {
  return `state_${state}` as ClipName
}

function switchClipFor(closed: boolean): ClipName {
  return closed ? 'switch_closed' : 'switch_open'
}

function noChange(state: SparshState): SparshTransition {
  return { state, effects: [] }
}

function summaryClipsFor(netlist: Netlist): ClipName[] {
  const { counts, topology } = describeCircuit(netlist)
  const clips: ClipName[] = ['your_circuit_has']
  for (const type of PART_MENU_ORDER) {
    const count = counts[type]
    if (count <= 0) continue
    const countClip = countClipFor(count)
    if (countClip) clips.push(countClip)
    clips.push(partClipFor(type))
  }
  if (topology === 'series') clips.push('in_series')
  else if (topology === 'parallel') clips.push('in_parallel')
  else if (topology === 'mixed') clips.push('in_series', 'in_parallel')
  else clips.push('not_connected')
  return clips
}

// The 1-finger double-tap gesture: opens the picker on 'wire' from idle, otherwise advances to
// the next type in PICKER_ORDER (gestureMap.ts), wrapping from 'battery' back to 'wire'. Reuses
// each part's PLACE_HAPTIC signature — see that const's comment above.
function advancePicker(state: SparshState): SparshTransition {
  const current = state.buildSub.kind === 'partChosen' ? state.buildSub.partType : null
  const currentIndex = current === null ? -1 : PICKER_ORDER.indexOf(current)
  const next = PICKER_ORDER[(currentIndex + 1) % PICKER_ORDER.length]
  return {
    state: { ...state, buildSub: { kind: 'partChosen', partType: next } },
    effects: hapticThenSpeak(PLACE_HAPTIC[next], [partClipFor(next), 'swipe_destination']),
  }
}

// Deliberately narrower than "any resistor/battery touching the cursor": only the component
// placed MOST RECENTLY overall, and only while the cursor still sits where that placement left
// it. "After placing" (the gesture's spec) means right after, not "any time the cursor later
// passes over it" — which matters because a loop's closing placement routinely lands the cursor
// back on an earlier part (e.g. the guided lesson's closing wire lands on the battery's own
// dot). Scoping to the latest placement means two-finger tap still means "run" there, since the
// latest placement is that wire, not the battery — undisturbed by what the cursor happens to be
// resting on.
function justPlacedValueComponentAt(netlist: Netlist, point: GridPoint): CircuitComponent | undefined {
  const last = netlist.components[netlist.components.length - 1]
  if (!last || (last.type !== 'resistor' && last.type !== 'battery')) return undefined
  if (!pointsEqual(last.from, point) && !pointsEqual(last.to, point)) return undefined
  return last
}

function nextCycledValue(values: number[], current: number | undefined, fallback: number): number {
  const index = values.indexOf(current ?? fallback)
  return values[(index + 1) % values.length]
}

function valueClipFor(type: 'resistor' | 'battery', value: number): ClipName {
  return type === 'resistor' ? ohmsClipFor(value) : voltsClipFor(value)
}

// The 2-finger-tap value-cycling gesture, for a resistor or battery already on the grid. Cycles
// RESISTOR_VALUES / BATTERY_VALUES (clips.ts) — the same presets Build mode's edit dialog offers
// — starting from whichever preset the physics default (src/physics/constants.ts) already sits
// at, so the very first cycle moves on from that default rather than restarting the list.
function cycleValue(state: SparshState, component: CircuitComponent): SparshTransition {
  const isResistor = component.type === 'resistor'
  const values = isResistor ? RESISTOR_VALUES : BATTERY_VALUES
  const fallback = isResistor ? DEFAULT_RESISTOR_RESISTANCE : DEFAULT_BATTERY_VOLTAGE
  const previousValue = component.value ?? fallback
  const nextValue = nextCycledValue(values, component.value, fallback)
  const type = component.type as 'resistor' | 'battery'

  return withLessonCheck({
    state: {
      ...state,
      netlist: {
        ...state.netlist,
        components: state.netlist.components.map((c) => (c.id === component.id ? { ...c, value: nextValue } : c)),
      },
      history: pushHistory(state, [partClipFor(component.type), valueClipFor(type, previousValue)]),
    },
    effects: [{ type: 'haptic', name: 'select' }, { type: 'speak', clips: [partClipFor(component.type), valueClipFor(type, nextValue)] }],
  })
}

function handleCursorMove(state: SparshState, direction: Direction): SparshTransition {
  const next = neighborInDirection(state.cursor, direction, state.netlist.gridSize)
  if (!next) {
    return { state, effects: hapticThenSpeak('invalid', ['edge']) }
  }
  const component = findComponentAt(state.netlist, next)
  const clips: ClipName[] = [posClipFor(next.row, next.col), component ? partClipFor(component.type) : 'empty']
  return {
    state: { ...state, cursor: next },
    effects: hapticThenSpeak('tap', clips),
  }
}

function handlePlacement(state: SparshState, partType: ComponentType, direction: Direction): SparshTransition {
  const { netlist, cursor } = state
  const neighbor = neighborInDirection(cursor, direction, netlist.gridSize)
  if (!neighbor) {
    return { state, effects: hapticThenSpeak('invalid', ['edge']) }
  }
  const occupant = findSegmentComponent(netlist, cursor, neighbor)
  if (occupant) {
    // Move the cursor there anyway, instead of staying stuck, and name exactly what's in the way.
    return { state: { ...state, cursor: neighbor }, effects: hapticThenSpeak('invalid', [alreadyClipFor(occupant.type)]) }
  }

  const component: CircuitComponent = {
    id: `sparsh-${state.nextId}`,
    type: partType,
    from: cursor,
    to: neighbor,
    ...(partType === 'switch' ? { closed: false } : {}),
  }
  // Wire stays chosen (sticky) so consecutive swipes keep laying wire; every other part
  // deselects itself once placed.
  const nextBuildSub: BuildSubMode = partType === 'wire' ? { kind: 'partChosen', partType: 'wire' } : { kind: 'idle' }

  return withLessonCheck({
    state: {
      ...state,
      nextId: state.nextId + 1,
      cursor: neighbor,
      netlist: { ...netlist, components: [...netlist.components, component] },
      buildSub: nextBuildSub,
      history: pushHistory(state, [partClipFor(partType), 'removed_suffix']),
    },
    effects: hapticThenSpeak(PLACE_HAPTIC[partType], ['placed', partClipFor(partType)]),
  })
}

function handleBuildSwipe(state: SparshState, direction: Direction): SparshTransition {
  if (state.buildSub.kind === 'partChosen') {
    return handlePlacement(state, state.buildSub.partType, direction)
  }
  return handleCursorMove(state, direction)
}

// feedbackFor() is the pure (event, solveResult) -> feedback mapping the task asks for. It's
// deliberately scoped to the one feedback decision that depends ONLY on the event (+ its
// result) and nothing else in SparshState: every other haptic in this file (tap/select/place/
// delete/undo/invalid/...) also depends on broader state — cursor position, what's chosen,
// segment occupancy, history — so those stay exercised by the ordinary transition tests above/
// below instead of a second, parallel pure function that would have to duplicate that state.
export function feedbackFor(event: SparshEvent, solveResult?: SolveResult | null): CircuitStatus | null {
  if (event.type !== 'SOLVE_RESULT') return null
  return classifyCircuitStatus(solveResult ?? event.result)
}

// The fixed run sequence (src/audio/runSequence.ts): announce the run, then (once that ends)
// the status haptic+sound, then (once that pattern clears) the existing per-outcome result
// clip, then always start sonify() — see docs/status/l1.md for why every branch now ends in
// sonify() even when nothing is actually flowing.
function runStartEffects(status: CircuitStatus): SparshEffect[] {
  return [
    { type: 'speak', clips: ['run_starting'] },
    { type: 'circuitStatus', status },
    { type: 'delay', ms: hapticDurationMs(hapticForCircuitStatus(status)) + SPEECH_AFTER_HAPTIC_MS },
  ]
}

function handleSolveResult(state: SparshState, result: SolveResult): SparshTransition {
  // classifyCircuitStatus() alone decides the haptic+sound bucket; it catches an individually
  // overloaded bulb even when result.ok is true and there's no 'short_circuit' error (that error
  // only fires when the *battery's own* current trips the limit) — see its own doc comment.
  const status = classifyCircuitStatus(result)
  const start = runStartEffects(status)

  if (result.errors.includes('empty') || result.errors.includes('no_battery')) {
    return {
      state: { ...state, lastResult: result },
      effects: [...start, { type: 'speak', clips: ['nothing_to_run'] }, { type: 'sonifyStart', result }],
    }
  }
  if (result.errors.includes('short_circuit')) {
    return {
      state: { ...state, lastResult: result },
      effects: [...start, { type: 'speak', clips: ['short_circuit'] }, { type: 'sonifyStart', result }],
    }
  }
  if (result.errors.includes('open_circuit')) {
    return {
      state: { ...state, lastResult: result },
      effects: [...start, { type: 'speak', clips: ['open_circuit'] }, { type: 'sonifyStart', result }],
    }
  }
  if (!result.ok) {
    return {
      state: { ...state, lastResult: result },
      effects: [...start, { type: 'speak', clips: ['nothing_to_run'] }, { type: 'sonifyStart', result }],
    }
  }

  // The only "existing result" left to speak for a successful run is the guided lesson's own
  // narration — the generic "running your circuit" announcement is gone, replaced up front by
  // RUN_STARTING_TEXT (see docs/status/l1.md for why: it was the suspected source of real-device
  // reports of a "legend"-like explanation playing on every run).
  const clips: ClipName[] = []
  let lesson = state.lesson
  if (lesson?.phase === 'seriesRun') {
    clips.push('lesson_series_result')
    lesson = { phase: 'parallel', stepIndex: 0 }
  } else if (lesson?.phase === 'parallelRun') {
    clips.push('lesson_compare', 'lesson_complete')
    lesson = null
  }

  return {
    state: {
      ...state,
      lastResult: result,
      mode: 'explore',
      explore: { point: state.cursor, overComponentId: null },
      lesson,
    },
    effects: [...start, ...(clips.length > 0 ? [{ type: 'speak', clips } as SparshEffect] : []), { type: 'sonifyStart', result }],
  }
}

function handleDrag(state: SparshState, point: GridPoint): SparshTransition {
  if (state.mode !== 'explore' || !state.explore) return noChange(state)
  const clamped: GridPoint = {
    row: Math.min(Math.max(point.row, 0), state.netlist.gridSize - 1),
    col: Math.min(Math.max(point.col, 0), state.netlist.gridSize - 1),
  }
  const component = findComponentAt(state.netlist, clamped)
  const overComponentId = component?.id ?? null
  const changed = overComponentId !== state.explore.overComponentId
  const effects: SparshEffect[] = changed && overComponentId ? [{ type: 'haptic', name: 'select' }] : []
  return {
    state: { ...state, explore: { point: clamped, overComponentId } },
    effects,
  }
}

function handleRest(state: SparshState, point: GridPoint): SparshTransition {
  if (state.mode !== 'explore' || !state.explore || !state.lastResult) return noChange(state)
  if (!pointsEqual(state.explore.point, point)) return noChange(state)
  const component = findComponentAt(state.netlist, point)
  if (!component) return noChange(state)
  const result = state.lastResult.components.find((c) => c.id === component.id)
  if (!result) return noChange(state)
  return { state, effects: [{ type: 'speak', clips: [partClipFor(component.type), stateClipFor(result.state)] }] }
}

function handleRemoveAtCursor(state: SparshState): SparshTransition {
  const component = findLatestComponentAt(state.netlist, state.cursor)
  if (!component) return { state, effects: [{ type: 'speak', clips: ['empty'] }] }
  return withLessonCheck({
    state: {
      ...state,
      netlist: { ...state.netlist, components: state.netlist.components.filter((c) => c.id !== component.id) },
      history: pushHistory(state, [partClipFor(component.type), 'is_back']),
    },
    effects: hapticThenSpeak('delete', ['removed', partClipFor(component.type)]),
  })
}

function handleToggleSwitchAtCursor(state: SparshState): SparshTransition {
  const component = state.netlist.components.find(
    (c) => c.type === 'switch' && (pointsEqual(c.from, state.cursor) || pointsEqual(c.to, state.cursor)),
  )
  if (!component) return { state, effects: [{ type: 'speak', clips: ['empty'] }] }
  const nextClosed = component.closed !== true
  return withLessonCheck({
    state: {
      ...state,
      netlist: {
        ...state.netlist,
        components: state.netlist.components.map((c) => (c.id === component.id ? { ...c, closed: nextClosed } : c)),
      },
      history: pushHistory(state, [switchClipFor(component.closed === true)]),
    },
    effects: hapticThenSpeak('toggle_switch', [switchClipFor(nextClosed)]),
  })
}

// Shared by TWO_FINGER_TAP (exiting Explore) and UNDO-from-Explore ("undo first stops the run,
// then undoes"): stops the tone and, if the lesson is waiting on the parallel rebuild, repeats
// that instruction now that the student is back in Build mode.
function exitExplore(state: SparshState): SparshTransition {
  const effects: SparshEffect[] = [{ type: 'sonifyStop' }]
  if (state.lesson?.phase === 'parallel') {
    effects.push({ type: 'speak', clips: PARALLEL_STEP_CLIPS[0] })
  }
  return { state: { ...state, mode: 'build', explore: null }, effects }
}

function popHistory(state: SparshState): SparshTransition {
  if (state.history.length === 0) {
    return { state, effects: [{ type: 'speak', clips: ['nothing_to_undo'] }] }
  }
  const entry = state.history[state.history.length - 1]
  const restoredLesson = state.lesson ? recomputeLessonAfterUndo(state.lesson, entry.netlist) : null
  return {
    state: {
      ...state,
      netlist: entry.netlist,
      cursor: entry.cursor,
      history: state.history.slice(0, -1),
      lesson: restoredLesson,
    },
    effects: hapticThenSpeak('undo', ['undone', ...entry.undoneClips, posClipFor(entry.cursor.row, entry.cursor.col)]),
  }
}

function handleUndo(state: SparshState): SparshTransition {
  // A chosen-but-not-yet-placed part isn't a history entry — undo just cancels it.
  if (state.buildSub.kind === 'partChosen') {
    return {
      state: { ...state, buildSub: { kind: 'idle' } },
      effects: [{ type: 'speak', clips: ['cancelled'] }],
    }
  }
  if (state.mode === 'explore') {
    const exited = exitExplore(state)
    const popped = popHistory(exited.state)
    return { state: popped.state, effects: [...exited.effects, ...popped.effects] }
  }
  return popHistory(state)
}

export function sparshReducer(state: SparshState, event: SparshEvent): SparshTransition {
  switch (event.type) {
    case 'INIT':
      return { state, effects: [{ type: 'speak', clips: ['welcome', 'talkback_hint', 'grid_intro'] }] }

    case 'SWIPE':
      if (state.mode !== 'build') return noChange(state)
      return handleBuildSwipe(state, event.direction)

    case 'SINGLE_TAP': {
      if (state.mode !== 'build') return noChange(state)
      const component = findComponentAt(state.netlist, state.cursor)
      const clips: ClipName[] = [
        posClipFor(state.cursor.row, state.cursor.col),
        component ? partClipFor(component.type) : 'empty',
      ]
      return { state, effects: [{ type: 'speak', clips }] }
    }

    case 'DOUBLE_TAP': {
      if (state.mode !== 'build') return noChange(state)
      // Idle, sitting on a placed switch: toggle it instead of opening the picker — there's
      // nothing useful to place on a dot a switch already occupies.
      if (state.buildSub.kind === 'idle') {
        const switchHere = state.netlist.components.find(
          (c) => c.type === 'switch' && (pointsEqual(c.from, state.cursor) || pointsEqual(c.to, state.cursor)),
        )
        if (switchHere) return handleToggleSwitchAtCursor(state)
      }
      return advancePicker(state)
    }

    case 'HOLD': {
      if (state.mode !== 'build') return noChange(state)
      if (state.buildSub.kind !== 'partChosen') return noChange(state) // nothing open to cancel
      return { state: { ...state, buildSub: { kind: 'idle' } }, effects: [{ type: 'speak', clips: ['cancelled'] }] }
    }

    // index.tsx restarts this 10s timer every time the picker opens or advances, and clears it
    // once the picker closes any other way (placed/cancelled). Closing it silently here (no
    // speech) — unlike HOLD, this is a courtesy background cleanup, not something the student did.
    case 'PICKER_IDLE_TIMEOUT': {
      if (state.buildSub.kind !== 'partChosen') return noChange(state)
      return { state: { ...state, buildSub: { kind: 'idle' } }, effects: [] }
    }

    case 'TWO_FINGER_TAP': {
      if (state.mode === 'build') {
        // Right after placing a resistor or battery, two-finger tap cycles its value instead of
        // running — see justPlacedValueComponentAt()'s comment for why this can never shadow
        // "run" once the student has moved on to placing something else.
        const valueComponent = justPlacedValueComponentAt(state.netlist, state.cursor)
        if (valueComponent) return cycleValue(state, valueComponent)
        return { state, effects: [{ type: 'solve' }] }
      }
      return exitExplore(state)
    }

    case 'TWO_FINGER_HOLD':
      if (state.mode !== 'build') return noChange(state)
      return { state, effects: [{ type: 'speak', clips: summaryClipsFor(state.netlist) }] }

    case 'TWO_FINGER_SWIPE_DOWN':
      if (state.mode !== 'build') return noChange(state)
      return handleRemoveAtCursor(state)

    case 'TWO_FINGER_SWIPE_UP':
      if (state.mode !== 'build') return noChange(state)
      return handleToggleSwitchAtCursor(state)

    case 'TWO_FINGER_SWIPE_RIGHT':
      return handleUndo(state)

    case 'TWO_FINGER_SWIPE_LEFT': {
      const now = event.now
      if (state.pendingExitAt !== null && now - state.pendingExitAt <= EXIT_CONFIRM_WINDOW_MS) {
        return { state: { ...state, pendingExitAt: null }, effects: [{ type: 'stopAll' }, { type: 'navigateHome' }] }
      }
      return { state: { ...state, pendingExitAt: now }, effects: [{ type: 'speak', clips: ['exit_confirm'] }] }
    }

    case 'BACK_INTERCEPTED':
      return { state, effects: [{ type: 'speak', clips: ['exit_blocked_back'] }] }

    case 'TWO_FINGER_DOUBLE_TAP': {
      const wasExploring = state.mode === 'explore'
      return {
        state: {
          ...state,
          mode: 'build',
          buildSub: { kind: 'idle' },
          explore: null,
          cursor: { row: 0, col: 0 },
          netlist: { ...state.netlist, components: [] },
          lesson: { phase: 'series', stepIndex: 0 },
          history: [],
        },
        effects: [
          ...(wasExploring ? ([{ type: 'sonifyStop' }] as SparshEffect[]) : []),
          { type: 'speak', clips: ['lesson_intro', ...SERIES_STEP_CLIPS[0]] },
        ],
      }
    }

    case 'THREE_FINGER_TAP':
      return { state, effects: [{ type: 'speak', clips: ['help'] }] }

    case 'SOLVE_RESULT':
      return handleSolveResult(state, event.result)

    case 'DRAG':
      return handleDrag(state, event.point)

    case 'REST':
      return handleRest(state, event.point)

    default:
      return noChange(state)
  }
}
