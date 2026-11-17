import type { CircuitComponent, ComponentType, GridPoint, Netlist, SolveResult } from '../contracts/netlist'
import { describeCircuit } from '../physics/describe'
import { countClipFor, partClipFor, posClipFor, PART_MENU_ORDER, type ClipName } from './clips'

export const GRID_SIZE = 5

export type Direction = 'up' | 'down' | 'left' | 'right'

export type Mode = 'build' | 'explore'

export type BuildSubMode =
  | { kind: 'idle' }
  | { kind: 'partMenu'; target: GridPoint; selectedIndex: number }
  | { kind: 'placingWire'; target: GridPoint; partType: ComponentType }
  | { kind: 'editMenu'; target: GridPoint; componentId: string; selectedIndex: number }

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

export interface SparshState {
  mode: Mode
  cursor: GridPoint
  netlist: Netlist
  buildSub: BuildSubMode
  explore: ExploreState | null
  lastResult: SolveResult | null
  nextId: number
  lesson: LessonState | null
}

export type SparshEvent =
  | { type: 'INIT' }
  | { type: 'SWIPE'; direction: Direction }
  | { type: 'DOUBLE_TAP' }
  | { type: 'LONG_PRESS' }
  | { type: 'TWO_FINGER_TAP' }
  | { type: 'TWO_FINGER_DOUBLE_TAP' }
  | { type: 'TWO_FINGER_SWIPE_LEFT' }
  | { type: 'SOLVE_RESULT'; result: SolveResult }
  | { type: 'DRAG'; point: GridPoint }
  | { type: 'REST'; point: GridPoint }

export type SparshEffect =
  | { type: 'speak'; clips: ClipName[] }
  | { type: 'vibrate'; pattern: number | number[] }
  | { type: 'solve' }
  | { type: 'sonifyStart'; result: SolveResult }
  | { type: 'sonifyStop' }
  | { type: 'stopAll' }
  | { type: 'navigateHome' }

export interface SparshTransition {
  state: SparshState
  effects: SparshEffect[]
}

const EDGE_VIBRATION = [30, 40, 30]
const TICK_VIBRATION = 10
const PULSE_VIBRATION = 25

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

function stateClipFor(state: SolveResult['components'][number]['state']): ClipName {
  return `state_${state}` as ClipName
}

function switchClipFor(closed: boolean): ClipName {
  return closed ? 'switch_closed' : 'switch_open'
}

type EditMenuOption = 'remove' | 'toggle' | 'add'

// 'add' lets a new part be started from a dot that already has a part on it — without it, a
// loop could never be closed, since the dot that closes it is, by definition, already occupied
// by the parts on either side of the gap.
function editMenuOptionsFor(component: CircuitComponent): EditMenuOption[] {
  return component.type === 'switch' ? ['remove', 'toggle', 'add'] : ['remove', 'add']
}

// Spoken preview for the currently-highlighted edit-menu option, built only from the fixed
// clip vocabulary: "remove" previews as the 'removed' clip, "toggle" previews the switch state
// it would flip *to*, and "add" reuses 'menu_open' since it leads to the same part chooser as
// double-tapping an empty dot.
function editMenuOptionClip(option: EditMenuOption, component: CircuitComponent): ClipName {
  if (option === 'remove') return 'removed'
  if (option === 'add') return 'menu_open'
  return switchClipFor(component.closed !== true)
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

function handleBuildSwipe(state: SparshState, direction: Direction): SparshTransition {
  const { buildSub, netlist, cursor } = state

  if (buildSub.kind === 'partMenu') {
    if (direction !== 'left' && direction !== 'right') return noChange(state)
    const delta = direction === 'right' ? 1 : -1
    const nextIndex = (buildSub.selectedIndex + delta + PART_MENU_ORDER.length) % PART_MENU_ORDER.length
    return {
      state: { ...state, buildSub: { ...buildSub, selectedIndex: nextIndex } },
      effects: [{ type: 'speak', clips: [partClipFor(PART_MENU_ORDER[nextIndex])] }],
    }
  }

  if (buildSub.kind === 'editMenu') {
    if (direction !== 'left' && direction !== 'right') return noChange(state)
    const component = netlist.components.find((c) => c.id === buildSub.componentId)
    if (!component) return { state: { ...state, buildSub: { kind: 'idle' } }, effects: [] }
    const options = editMenuOptionsFor(component)
    const delta = direction === 'right' ? 1 : -1
    const nextIndex = (buildSub.selectedIndex + delta + options.length) % options.length
    return {
      state: { ...state, buildSub: { ...buildSub, selectedIndex: nextIndex } },
      effects: [{ type: 'speak', clips: [editMenuOptionClip(options[nextIndex], component)] }],
    }
  }

  if (buildSub.kind === 'placingWire') {
    const neighbor = neighborInDirection(buildSub.target, direction, netlist.gridSize)
    if (!neighbor) {
      return { state, effects: [{ type: 'speak', clips: ['edge'] }, { type: 'vibrate', pattern: EDGE_VIBRATION }] }
    }
    const component: CircuitComponent = {
      id: `sparsh-${state.nextId}`,
      type: buildSub.partType,
      from: buildSub.target,
      to: neighbor,
      ...(buildSub.partType === 'switch' ? { closed: false } : {}),
    }
    return withLessonCheck({
      state: {
        ...state,
        nextId: state.nextId + 1,
        netlist: { ...netlist, components: [...netlist.components, component] },
        buildSub: { kind: 'idle' },
      },
      effects: [{ type: 'speak', clips: ['placed'] }],
    })
  }

  // idle: move the cursor
  const next = neighborInDirection(cursor, direction, netlist.gridSize)
  if (!next) {
    return { state, effects: [{ type: 'speak', clips: ['edge'] }, { type: 'vibrate', pattern: EDGE_VIBRATION }] }
  }
  const component = findComponentAt(netlist, next)
  const clips: ClipName[] = [posClipFor(next.row, next.col), component ? partClipFor(component.type) : 'empty']
  return {
    state: { ...state, cursor: next },
    effects: [{ type: 'speak', clips }, { type: 'vibrate', pattern: TICK_VIBRATION }],
  }
}

function handleBuildDoubleTap(state: SparshState): SparshTransition {
  const { buildSub, netlist, cursor } = state

  if (buildSub.kind === 'partMenu') {
    const partType = PART_MENU_ORDER[buildSub.selectedIndex]
    return {
      state: { ...state, buildSub: { kind: 'placingWire', target: buildSub.target, partType } },
      effects: [{ type: 'speak', clips: ['wire_direction'] }],
    }
  }

  if (buildSub.kind === 'editMenu') {
    const component = netlist.components.find((c) => c.id === buildSub.componentId)
    if (!component) return { state: { ...state, buildSub: { kind: 'idle' } }, effects: [] }
    const options = editMenuOptionsFor(component)
    const option = options[buildSub.selectedIndex]
    if (option === 'remove') {
      return withLessonCheck({
        state: {
          ...state,
          buildSub: { kind: 'idle' },
          netlist: { ...netlist, components: netlist.components.filter((c) => c.id !== component.id) },
        },
        effects: [{ type: 'speak', clips: ['removed'] }],
      })
    }
    if (option === 'add') {
      return {
        state: { ...state, buildSub: { kind: 'partMenu', target: buildSub.target, selectedIndex: 0 } },
        effects: [{ type: 'speak', clips: ['menu_open', partClipFor(PART_MENU_ORDER[0])] }],
      }
    }
    const nextClosed = component.closed !== true
    return withLessonCheck({
      state: {
        ...state,
        buildSub: { kind: 'idle' },
        netlist: {
          ...netlist,
          components: netlist.components.map((c) => (c.id === component.id ? { ...c, closed: nextClosed } : c)),
        },
      },
      effects: [{ type: 'speak', clips: [switchClipFor(nextClosed)] }],
    })
  }

  if (buildSub.kind === 'placingWire') return noChange(state)

  // idle: open the menu for the dot under the cursor
  const component = findComponentAt(netlist, cursor)
  if (!component) {
    return {
      state: { ...state, buildSub: { kind: 'partMenu', target: cursor, selectedIndex: 0 } },
      effects: [{ type: 'speak', clips: ['menu_open', partClipFor(PART_MENU_ORDER[0])] }],
    }
  }
  return {
    state: { ...state, buildSub: { kind: 'editMenu', target: cursor, componentId: component.id, selectedIndex: 0 } },
    effects: [{ type: 'speak', clips: [editMenuOptionClip(editMenuOptionsFor(component)[0], component)] }],
  }
}

function handleSolveResult(state: SparshState, result: SolveResult): SparshTransition {
  if (result.errors.includes('empty') || result.errors.includes('no_battery')) {
    return { state: { ...state, lastResult: result }, effects: [{ type: 'speak', clips: ['nothing_to_run'] }] }
  }
  if (result.errors.includes('short_circuit')) {
    return { state: { ...state, lastResult: result }, effects: [{ type: 'speak', clips: ['short_circuit'] }] }
  }
  if (result.errors.includes('open_circuit')) {
    return { state: { ...state, lastResult: result }, effects: [{ type: 'speak', clips: ['open_circuit'] }] }
  }
  if (!result.ok) {
    return { state: { ...state, lastResult: result }, effects: [{ type: 'speak', clips: ['nothing_to_run'] }] }
  }

  const clips: ClipName[] = ['run']
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
    effects: [{ type: 'speak', clips }, { type: 'sonifyStart', result }],
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
  const effects: SparshEffect[] = changed && overComponentId ? [{ type: 'vibrate', pattern: PULSE_VIBRATION }] : []
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

export function sparshReducer(state: SparshState, event: SparshEvent): SparshTransition {
  switch (event.type) {
    case 'INIT':
      return { state, effects: [{ type: 'speak', clips: ['welcome', 'talkback_hint', 'grid_intro'] }] }

    case 'SWIPE':
      if (state.mode !== 'build') return noChange(state)
      return handleBuildSwipe(state, event.direction)

    case 'DOUBLE_TAP':
      if (state.mode !== 'build') return noChange(state)
      return handleBuildDoubleTap(state)

    case 'LONG_PRESS':
      if (state.mode !== 'build') return noChange(state)
      return { state, effects: [{ type: 'speak', clips: summaryClipsFor(state.netlist) }] }

    case 'TWO_FINGER_TAP': {
      if (state.mode === 'build') return { state, effects: [{ type: 'solve' }] }
      const effects: SparshEffect[] = [{ type: 'sonifyStop' }]
      if (state.lesson?.phase === 'parallel') {
        effects.push({ type: 'speak', clips: PARALLEL_STEP_CLIPS[0] })
      }
      return { state: { ...state, mode: 'build', explore: null }, effects }
    }

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
        },
        effects: [
          ...(wasExploring ? ([{ type: 'sonifyStop' }] as SparshEffect[]) : []),
          { type: 'speak', clips: ['lesson_intro', ...SERIES_STEP_CLIPS[0]] },
        ],
      }
    }

    case 'SOLVE_RESULT':
      return handleSolveResult(state, event.result)

    case 'DRAG':
      return handleDrag(state, event.point)

    case 'REST':
      return handleRest(state, event.point)

    case 'TWO_FINGER_SWIPE_LEFT':
      return { state, effects: [{ type: 'stopAll' }, { type: 'navigateHome' }] }

    default:
      return noChange(state)
  }
}
