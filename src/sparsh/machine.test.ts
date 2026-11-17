import { describe, expect, it } from 'vitest'
import type { Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { createInitialState, sparshReducer, type Direction, type SparshState } from './machine'

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

  it('"add" lets a new part start from a dot that already has a part on it', () => {
    // Without this, a loop could never close: the dot that closes it is always already occupied.
    const state = placeBulb() // bulb at (0,0)->(0,1); cursor stays at (0,0)
    const openEdit = sparshReducer(state, { type: 'DOUBLE_TAP' })
    expect(openEdit.state.buildSub).toMatchObject({ kind: 'editMenu', selectedIndex: 0 })

    const cycleToAdd = sparshReducer(openEdit.state, { type: 'SWIPE', direction: 'right' })
    expect(cycleToAdd.effects).toEqual([{ type: 'speak', clips: ['menu_open'] }])

    const confirmAdd = sparshReducer(cycleToAdd.state, { type: 'DOUBLE_TAP' })
    expect(confirmAdd.state.buildSub).toEqual({ kind: 'partMenu', target: { row: 0, col: 0 }, selectedIndex: 0 })
    expect(confirmAdd.effects).toEqual([{ type: 'speak', clips: ['menu_open', 'battery'] }])

    const pickBulb = sparshReducer(confirmAdd.state, { type: 'SWIPE', direction: 'right' }) // -> bulb
    const confirmBulb = sparshReducer(pickBulb.state, { type: 'DOUBLE_TAP' })
    const placed = sparshReducer(confirmBulb.state, { type: 'SWIPE', direction: 'down' })
    expect(placed.state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
      { id: 'sparsh-2', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 1, col: 0 } },
    ])
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

describe('sparshReducer: guided lesson', () => {
  const PART_INDEX = { battery: 0, bulb: 1, resistor: 2, switch: 3, wire: 4 }

  function step(state: SparshState, event: Parameters<typeof sparshReducer>[1]) {
    return sparshReducer(state, event).state
  }

  // Double-taps an EMPTY dot, cycles the part menu to `partIndex`, confirms, then swipes
  // `placeDirection` to place it — the ordinary placement flow from Phase 2.
  function placeFromEmptyDot(state: SparshState, partIndex: number, placeDirection: Direction): SparshState {
    let s = step(state, { type: 'DOUBLE_TAP' })
    for (let i = 0; i < partIndex; i++) s = step(s, { type: 'SWIPE', direction: 'right' })
    s = step(s, { type: 'DOUBLE_TAP' })
    return step(s, { type: 'SWIPE', direction: placeDirection })
  }

  // Double-taps a dot that already has a part on it, cycles the edit menu to "add" (always the
  // option right after "remove"), confirms, then places the new part like placeFromEmptyDot.
  function placeFromOccupiedDot(state: SparshState, partIndex: number, placeDirection: Direction): SparshState {
    let s = step(state, { type: 'DOUBLE_TAP' }) // editMenu, 'remove' selected
    s = step(s, { type: 'SWIPE', direction: 'right' }) // -> 'add'
    s = step(s, { type: 'DOUBLE_TAP' }) // confirm 'add' -> partMenu
    for (let i = 0; i < partIndex; i++) s = step(s, { type: 'SWIPE', direction: 'right' })
    s = step(s, { type: 'DOUBLE_TAP' })
    return step(s, { type: 'SWIPE', direction: placeDirection })
  }

  function removePartHere(state: SparshState): SparshState {
    const s = step(state, { type: 'DOUBLE_TAP' }) // editMenu, 'remove' selected by default
    return step(s, { type: 'DOUBLE_TAP' })
  }

  function moveCursor(state: SparshState, direction: Direction): SparshState {
    return step(state, { type: 'SWIPE', direction })
  }

  function runAndDispatchResult(state: SparshState): { state: SparshState; effects: ReturnType<typeof sparshReducer>['effects'] } {
    const solved = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
    expect(solved.effects).toEqual([{ type: 'solve' }])
    const result = solve(solved.state.netlist)
    return sparshReducer(solved.state, { type: 'SOLVE_RESULT', result })
  }

  it('starts on a two-finger double-tap, clearing any existing build', () => {
    const built = placeFromEmptyDot(createInitialState(), PART_INDEX.wire, 'right')
    expect(built.netlist.components).toHaveLength(1)

    const { state, effects } = sparshReducer(built, { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(state.netlist.components).toHaveLength(0)
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })
    expect(effects).toEqual([{ type: 'speak', clips: ['lesson_intro', 'lesson_step_battery'] }])
  })

  it('also stops sonify when started from explore mode', () => {
    const okResult: SolveResult = { ok: true, errors: [], warnings: [], components: [] }
    const exploring = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult }).state
    const { effects } = sparshReducer(exploring, { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(effects).toEqual([
      { type: 'sonifyStop' },
      { type: 'speak', clips: ['lesson_intro', 'lesson_step_battery'] },
    ])
  })

  it('cascades through steps already satisfied out of order', () => {
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })

    // Place both bulbs before the battery, each from a fresh empty dot — step 0 (battery)
    // should keep waiting throughout, since neither placement satisfies it.
    state = placeFromEmptyDot(state, PART_INDEX.bulb, 'right') // bulb at (0,0)->(0,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = moveCursor(state, 'down') // -> (1,0), empty
    state = placeFromEmptyDot(state, PART_INDEX.bulb, 'right') // bulb at (1,0)->(1,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    // Now place the battery, disconnected from both bulbs: steps 0, 1, and 2 all complete in
    // one go (both bulbs already exist), landing on step 3 (close the loop) — which stays
    // incomplete, since none of these three parts are actually connected to each other yet.
    state = moveCursor(state, 'down') // -> (2,0), empty
    const opened = sparshReducer(state, { type: 'DOUBLE_TAP' }) // partMenu; battery is selectedIndex 0
    const confirmed = sparshReducer(opened.state, { type: 'DOUBLE_TAP' })
    const { state: afterBattery, effects } = sparshReducer(confirmed.state, { type: 'SWIPE', direction: 'right' })

    expect(afterBattery.lesson).toEqual({ phase: 'series', stepIndex: 3 })
    expect(effects).toEqual([
      { type: 'speak', clips: ['placed'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_bulb1'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_bulb2'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_close_loop'] },
    ])
  })

  it('walks the full series build -> run -> parallel rebuild -> run demo with real gestures and real solve()', () => {
    // Layout: a unit square so every placement — including the loop-closing part — is a single
    // swipe from an adjacent dot. (0,0)-(0,1) top [battery], (0,1)-(1,1) right [bulb1],
    // (1,1)-(1,0) bottom [bulb2], (1,0)-(0,0) left [wire, closes the loop].
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    // Step 1: battery (0,0)->(0,1).
    state = placeFromEmptyDot(state, PART_INDEX.battery, 'right')
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 1 })

    // Step 2: bulb1, opened from the empty dot (1,1), placed back to (0,1).
    state = moveCursor(state, 'right') // -> (0,1), occupied
    state = moveCursor(state, 'down') // -> (1,1), empty
    state = placeFromEmptyDot(state, PART_INDEX.bulb, 'up')
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 2 })

    // Step 3: bulb2, opened from the empty dot (1,0), placed back to (1,1).
    state = moveCursor(state, 'left') // -> (1,0), empty
    state = placeFromEmptyDot(state, PART_INDEX.bulb, 'right')
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 3 })

    // Step 4: close the loop. Both (1,0) and (0,0) are already occupied, so this needs "add".
    const closing = placeFromOccupiedDot(state, PART_INDEX.wire, 'up')
    expect(closing.lesson).toEqual({ phase: 'seriesRun', stepIndex: 0 })
    state = closing

    expect(state.netlist.components).toHaveLength(4)
    expect(state.netlist.components.map((c) => c.type).sort()).toEqual(['battery', 'bulb', 'bulb', 'wire'])

    // Run it: a real solve() on this exact netlist should succeed.
    const ran = runAndDispatchResult(state)
    expect(ran.state.mode).toBe('explore')
    expect(ran.state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 })
    expect(ran.effects).toEqual([
      { type: 'speak', clips: ['run', 'lesson_series_result'] },
      { type: 'sonifyStart', result: expect.objectContaining({ ok: true }) },
    ])
    state = ran.state

    // Exit explore: the parallel-rebuild instruction is spoken on the way out.
    const exited = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
    expect(exited.state.mode).toBe('build')
    expect(exited.effects).toEqual([
      { type: 'sonifyStop' },
      { type: 'speak', clips: ['lesson_parallel_intro'] },
    ])
    state = exited.state

    // Rebuild in parallel: cursor is at (1,0) (bulb2's dot). Swap bulb2 for a wire so the
    // return path stays closed, then add a second bulb in parallel with bulb1.
    state = removePartHere(state) // removes bulb2 at (1,0)-(1,1)
    state = placeFromOccupiedDot(state, PART_INDEX.wire, 'right') // (1,0)-(1,1), keeps the loop closed
    expect(state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 }) // not parallel yet — only 1 bulb

    state = moveCursor(state, 'right') // -> (1,1), occupied by bulb1 (and the new wire)
    state = placeFromOccupiedDot(state, PART_INDEX.bulb, 'up') // bulb, parallel with bulb1, (1,1)->(0,1)
    expect(state.lesson).toEqual({ phase: 'parallelRun', stepIndex: 0 })

    // Run it again: a real solve() should report the two bulbs in parallel.
    const ranAgain = runAndDispatchResult(state)
    expect(ranAgain.state.lesson).toBeNull()
    expect(ranAgain.effects).toEqual([
      { type: 'speak', clips: ['run', 'lesson_compare', 'lesson_complete'] },
      { type: 'sonifyStart', result: expect.objectContaining({ ok: true }) },
    ])

    const finalNetlist: Netlist = ranAgain.state.netlist
    expect(finalNetlist.components.filter((c) => c.type === 'bulb')).toHaveLength(2)
    const [bulbA, bulbB] = finalNetlist.components.filter((c) => c.type === 'bulb')
    const samePair =
      (bulbA.from.row === bulbB.from.row && bulbA.from.col === bulbB.from.col) ||
      (bulbA.from.row === bulbB.to.row && bulbA.from.col === bulbB.to.col)
    expect(samePair).toBe(true)
  })
})
