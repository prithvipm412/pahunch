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

export interface SparshState {
  mode: Mode
  cursor: GridPoint
  netlist: Netlist
  buildSub: BuildSubMode
  explore: ExploreState | null
  lastResult: SolveResult | null
  nextId: number
}

export type SparshEvent =
  | { type: 'INIT' }
  | { type: 'SWIPE'; direction: Direction }
  | { type: 'DOUBLE_TAP' }
  | { type: 'LONG_PRESS' }
  | { type: 'TWO_FINGER_TAP' }
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
  }
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

function editMenuOptionsFor(component: CircuitComponent): Array<'remove' | 'toggle'> {
  return component.type === 'switch' ? ['remove', 'toggle'] : ['remove']
}

// Spoken preview for the currently-highlighted edit-menu option, built only from the fixed
// clip vocabulary: "remove" previews as the 'removed' clip, "toggle" previews the switch state
// it would flip *to*.
function editMenuOptionClip(option: 'remove' | 'toggle', component: CircuitComponent): ClipName {
  if (option === 'remove') return 'removed'
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
    return {
      state: {
        ...state,
        nextId: state.nextId + 1,
        netlist: { ...netlist, components: [...netlist.components, component] },
        buildSub: { kind: 'idle' },
      },
      effects: [{ type: 'speak', clips: ['placed'] }],
    }
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
      return {
        state: {
          ...state,
          buildSub: { kind: 'idle' },
          netlist: { ...netlist, components: netlist.components.filter((c) => c.id !== component.id) },
        },
        effects: [{ type: 'speak', clips: ['removed'] }],
      }
    }
    const nextClosed = component.closed !== true
    return {
      state: {
        ...state,
        buildSub: { kind: 'idle' },
        netlist: {
          ...netlist,
          components: netlist.components.map((c) => (c.id === component.id ? { ...c, closed: nextClosed } : c)),
        },
      },
      effects: [{ type: 'speak', clips: [switchClipFor(nextClosed)] }],
    }
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
  return {
    state: {
      ...state,
      lastResult: result,
      mode: 'explore',
      explore: { point: state.cursor, overComponentId: null },
    },
    effects: [{ type: 'speak', clips: ['run'] }, { type: 'sonifyStart', result }],
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

    case 'TWO_FINGER_TAP':
      if (state.mode === 'build') return { state, effects: [{ type: 'solve' }] }
      return { state: { ...state, mode: 'build', explore: null }, effects: [{ type: 'sonifyStop' }] }

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
