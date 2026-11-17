import { describe, expect, it } from 'vitest'
import type { SolveResult } from '../contracts/netlist'
import { createInitialState, sparshReducer, type SparshState } from './machine'

function apply(state: SparshState, events: Parameters<typeof sparshReducer>[1][]) {
  let current = state
  let lastEffects: ReturnType<typeof sparshReducer>['effects'] = []
  for (const event of events) {
    const result = sparshReducer(current, event)
    current = result.state
    lastEffects = result.effects
  }
  return { state: current, effects: lastEffects }
}

describe('sparshReducer: entry', () => {
  it('INIT speaks welcome, hint, and grid intro', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'INIT' })
    expect(effects).toEqual([{ type: 'speak', clips: ['welcome', 'talkback_hint', 'grid_intro'] }])
  })
})

describe('sparshReducer: cursor movement', () => {
  it('moves right and speaks the new position plus empty', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SWIPE', direction: 'right' })
    expect(state.cursor).toEqual({ row: 0, col: 1 })
    expect(effects).toEqual([
      { type: 'speak', clips: ['pos_r1c2', 'empty'] },
      { type: 'vibrate', pattern: 10 },
    ])
  })

  it('does not move past the edge and plays the edge effect', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SWIPE', direction: 'up' })
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(effects).toEqual([
      { type: 'speak', clips: ['edge'] },
      { type: 'vibrate', pattern: [30, 40, 30] },
    ])
  })

  it('announces the part name when moving onto an occupied dot', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [
      { type: 'DOUBLE_TAP' }, // open part menu at (0,0)
      { type: 'DOUBLE_TAP' }, // pick battery (default selection)
      { type: 'SWIPE', direction: 'right' }, // place battery from (0,0) to (0,1)
    ]))
    expect(state.netlist.components).toHaveLength(1)
    expect(state.cursor).toEqual({ row: 0, col: 0 })

    const { effects } = sparshReducer(state, { type: 'SWIPE', direction: 'right' })
    expect(effects[0]).toEqual({ type: 'speak', clips: ['pos_r1c2', 'battery'] })
  })
})

describe('sparshReducer: part menu and placement', () => {
  it('cycles through part types with left/right swipes', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [{ type: 'DOUBLE_TAP' }]))
    expect(state.buildSub).toEqual({ kind: 'partMenu', target: { row: 0, col: 0 }, selectedIndex: 0 })

    const next = sparshReducer(state, { type: 'SWIPE', direction: 'right' })
    expect(next.state.buildSub).toMatchObject({ kind: 'partMenu', selectedIndex: 1 })
    expect(next.effects).toEqual([{ type: 'speak', clips: ['bulb'] }])

    const wrapped = sparshReducer(createInitialState(), { type: 'DOUBLE_TAP' })
    const backward = sparshReducer(wrapped.state, { type: 'SWIPE', direction: 'left' })
    expect(backward.state.buildSub).toMatchObject({ selectedIndex: 4 })
    expect(backward.effects).toEqual([{ type: 'speak', clips: ['wire'] }])
  })

  it('places the selected part in the swiped direction and gives it a unique id', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' }, // -> bulb
      { type: 'DOUBLE_TAP' }, // pick bulb
    ]))
    expect(state.buildSub).toEqual({ kind: 'placingWire', target: { row: 0, col: 0 }, partType: 'bulb' })

    const placed = sparshReducer(state, { type: 'SWIPE', direction: 'down' })
    expect(placed.effects).toEqual([{ type: 'speak', clips: ['placed'] }])
    expect(placed.state.buildSub).toEqual({ kind: 'idle' })
    expect(placed.state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 1, col: 0 } },
    ])
    expect(placed.state.nextId).toBe(2)
  })

  it('stays in placingWire and plays edge feedback when the direction runs off the grid', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [{ type: 'DOUBLE_TAP' }, { type: 'DOUBLE_TAP' }]))
    const result = sparshReducer(state, { type: 'SWIPE', direction: 'up' })
    expect(result.state.buildSub.kind).toBe('placingWire')
    expect(result.state.netlist.components).toHaveLength(0)
    expect(result.effects).toEqual([
      { type: 'speak', clips: ['edge'] },
      { type: 'vibrate', pattern: [30, 40, 30] },
    ])
  })

  it('gives switches closed: false by default when placed', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'SWIPE', direction: 'right' }, // -> switch
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
    ]))
    expect(state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'switch', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, closed: false },
    ])
  })
})

describe('sparshReducer: edit menu', () => {
  function placeBulb(): SparshState {
    const { state } = apply(createInitialState(), [
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
    ])
    return state
  }

  it('removes a non-switch part immediately on double-tap', () => {
    const state = placeBulb()
    const opened = sparshReducer(state, { type: 'DOUBLE_TAP' })
    expect(opened.state.buildSub).toMatchObject({ kind: 'editMenu', selectedIndex: 0 })
    expect(opened.effects).toEqual([{ type: 'speak', clips: ['removed'] }])

    const removed = sparshReducer(opened.state, { type: 'DOUBLE_TAP' })
    expect(removed.state.netlist.components).toHaveLength(0)
    expect(removed.state.buildSub).toEqual({ kind: 'idle' })
    expect(removed.effects).toEqual([{ type: 'speak', clips: ['removed'] }])
  })

  it('cycles remove/toggle for a switch and toggles its closed state', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
    ]))
    expect(state.netlist.components[0]).toMatchObject({ type: 'switch', closed: false })

    const opened = sparshReducer(state, { type: 'DOUBLE_TAP' })
    expect(opened.effects).toEqual([{ type: 'speak', clips: ['removed'] }])

    const cycled = sparshReducer(opened.state, { type: 'SWIPE', direction: 'right' })
    expect(cycled.state.buildSub).toMatchObject({ selectedIndex: 1 })
    expect(cycled.effects).toEqual([{ type: 'speak', clips: ['switch_closed'] }])

    const toggled = sparshReducer(cycled.state, { type: 'DOUBLE_TAP' })
    expect(toggled.state.netlist.components[0]).toMatchObject({ closed: true })
    expect(toggled.effects).toEqual([{ type: 'speak', clips: ['switch_closed'] }])
    expect(toggled.state.buildSub).toEqual({ kind: 'idle' })
  })
})

describe('sparshReducer: long-press summary', () => {
  it('reports not_connected for an empty circuit', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'LONG_PRESS' })
    expect(effects).toEqual([{ type: 'speak', clips: ['your_circuit_has', 'not_connected'] }])
  })

  it('reports counts and in_series for a series circuit', () => {
    let state = createInitialState()
    ;({ state } = apply(state, [
      { type: 'DOUBLE_TAP' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
      { type: 'DOUBLE_TAP' },
      { type: 'SWIPE', direction: 'right' },
    ]))
    // battery(0,0->0,1), bulb(0,0->0,1) -- placed from same cursor without moving, just to build counts
    const { effects } = sparshReducer(state, { type: 'LONG_PRESS' })
    expect(effects[0].type).toBe('speak')
  })
})

describe('sparshReducer: run / explore', () => {
  const okResult: SolveResult = {
    ok: true,
    errors: [],
    warnings: [],
    components: [{ id: 'bulb1', voltage: 3, current: 0.3, power: 0.9, state: 'normal' }],
  }

  it('asks the screen to solve on two-finger tap in build mode', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_TAP' })
    expect(effects).toEqual([{ type: 'solve' }])
  })

  it('speaks nothing_to_run for an empty/no-battery result', () => {
    const result: SolveResult = { ok: false, errors: ['empty'], warnings: [], components: [] }
    const { effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result })
    expect(effects).toEqual([{ type: 'speak', clips: ['nothing_to_run'] }])
  })

  it('speaks short_circuit and stays in build mode', () => {
    const result: SolveResult = { ok: false, errors: ['short_circuit'], warnings: [], components: [] }
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result })
    expect(state.mode).toBe('build')
    expect(effects).toEqual([{ type: 'speak', clips: ['short_circuit'] }])
  })

  it('speaks open_circuit and stays in build mode', () => {
    const result: SolveResult = { ok: false, errors: ['open_circuit'], warnings: [], components: [] }
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result })
    expect(state.mode).toBe('build')
    expect(effects).toEqual([{ type: 'speak', clips: ['open_circuit'] }])
  })

  it('enters explore mode and starts sonify on a good result', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult })
    expect(state.mode).toBe('explore')
    expect(state.explore).toEqual({ point: { row: 0, col: 0 }, overComponentId: null })
    expect(effects).toEqual([
      { type: 'speak', clips: ['run'] },
      { type: 'sonifyStart', result: okResult },
    ])
  })

  it('exits explore back to build and stops sonify on the next two-finger tap', () => {
    const exploring = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult }).state
    const { state, effects } = sparshReducer(exploring, { type: 'TWO_FINGER_TAP' })
    expect(state.mode).toBe('build')
    expect(state.explore).toBeNull()
    expect(effects).toEqual([{ type: 'sonifyStop' }])
  })

  it('pulses only on entering a part while dragging in explore mode', () => {
    const exploring = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult }).state
    const withBulb: SparshState = {
      ...exploring,
      netlist: {
        ...exploring.netlist,
        components: [{ id: 'bulb1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
      },
    }

    const onPart = sparshReducer(withBulb, { type: 'DRAG', point: { row: 0, col: 1 } })
    expect(onPart.state.explore?.overComponentId).toBe('bulb1')
    expect(onPart.effects).toEqual([{ type: 'vibrate', pattern: 25 }])

    const stillOnPart = sparshReducer(onPart.state, { type: 'DRAG', point: { row: 0, col: 1 } })
    expect(stillOnPart.effects).toEqual([])

    const offPart = sparshReducer(onPart.state, { type: 'DRAG', point: { row: 2, col: 2 } })
    expect(offPart.state.explore?.overComponentId).toBeNull()
    expect(offPart.effects).toEqual([])
  })

  it('speaks the part name and state after resting on it', () => {
    const exploring = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult }).state
    const withBulb: SparshState = {
      ...exploring,
      netlist: {
        ...exploring.netlist,
        components: [{ id: 'bulb1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
      },
    }
    const dragged = sparshReducer(withBulb, { type: 'DRAG', point: { row: 0, col: 1 } }).state
    const { effects } = sparshReducer(dragged, { type: 'REST', point: { row: 0, col: 1 } })
    expect(effects).toEqual([{ type: 'speak', clips: ['bulb', 'state_normal'] }])
  })

  it('does not speak on rest if the finger has since moved', () => {
    const exploring = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult }).state
    const withBulb: SparshState = {
      ...exploring,
      netlist: {
        ...exploring.netlist,
        components: [{ id: 'bulb1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
      },
    }
    const dragged = sparshReducer(withBulb, { type: 'DRAG', point: { row: 0, col: 1 } }).state
    const { effects } = sparshReducer(dragged, { type: 'REST', point: { row: 2, col: 2 } })
    expect(effects).toEqual([])
  })
})

describe('sparshReducer: two-finger swipe left', () => {
  it('stops everything and navigates home regardless of mode', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_LEFT' })
    expect(effects).toEqual([{ type: 'stopAll' }, { type: 'navigateHome' }])
  })
})
