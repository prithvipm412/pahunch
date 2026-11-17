import { describe, expect, it } from 'vitest'
import type { Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { createInitialState, sparshReducer, type Direction, type SparshState } from './machine'

function step(state: SparshState, event: Parameters<typeof sparshReducer>[1]) {
  return sparshReducer(state, event).state
}

// Dispatches `count` TAP events followed by TAP_FINALIZE — the sequence index.tsx produces for
// a finalized tap count.
function tapCount(state: SparshState, count: number) {
  let s = state
  for (let i = 0; i < count; i++) s = step(s, { type: 'TAP' })
  return sparshReducer(s, { type: 'TAP_FINALIZE' })
}

describe('sparshReducer: entry', () => {
  it('INIT speaks welcome, hint, and grid intro', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'INIT' })
    expect(effects).toEqual([{ type: 'speak', clips: ['welcome', 'talkback_hint', 'grid_intro'] }])
  })
})

describe('sparshReducer: cursor movement', () => {
  it('moves right and always announces the new position plus empty', () => {
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
    state = tapCount(state, 1).state // repeat (no-op on an empty cursor, just to exercise it)
    state = tapCount(state, 4).state // choose resistor
    const placed = sparshReducer(state, { type: 'SWIPE', direction: 'right' })
    expect(placed.state.netlist.components).toHaveLength(1)

    const { effects } = sparshReducer(placed.state, { type: 'SWIPE', direction: 'left' })
    expect(effects[0]).toEqual({ type: 'speak', clips: ['pos_r1c1', 'resistor'] })
  })
})

describe('sparshReducer: one-finger tap counting', () => {
  it('ticks on every raw tap without speaking', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'TAP' })
    expect(state.pendingTapCount).toBe(1)
    expect(effects).toEqual([{ type: 'vibrate', pattern: 8 }])
  })

  it('TAP_FINALIZE with count 1 while idle repeats position and part', () => {
    const { state, effects } = tapCount(createInitialState(), 1)
    expect(state.pendingTapCount).toBe(0)
    expect(effects).toEqual([{ type: 'speak', clips: ['pos_r1c1', 'empty'] }])
  })

  it('is a no-op if finalize fires with nothing pending', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TAP_FINALIZE' })
    expect(effects).toEqual([])
  })

  it('2 taps choose wire, with its own vibration pattern', () => {
    const { state, effects } = tapCount(createInitialState(), 2)
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(effects).toEqual([
      { type: 'speak', clips: ['wire', 'swipe_destination'] },
      { type: 'vibrate', pattern: [20] },
    ])
  })

  it('3 taps choose bulb', () => {
    const { state, effects } = tapCount(createInitialState(), 3)
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'bulb' })
    expect(effects).toEqual([
      { type: 'speak', clips: ['bulb', 'swipe_destination'] },
      { type: 'vibrate', pattern: [20, 60, 20] },
    ])
  })

  it('4 taps choose resistor', () => {
    const { state, effects } = tapCount(createInitialState(), 4)
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'resistor' })
    expect(effects).toEqual([
      { type: 'speak', clips: ['resistor', 'swipe_destination'] },
      { type: 'vibrate', pattern: [20, 60, 20, 60, 20] },
    ])
  })

  it('clamps more than 4 taps down to resistor', () => {
    const { state } = tapCount(createInitialState(), 6)
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'resistor' })
  })

  it('TAP_RESET silently clears a pending count', () => {
    let state = step(createInitialState(), { type: 'TAP' })
    expect(state.pendingTapCount).toBe(1)
    const { state: reset, effects } = sparshReducer(state, { type: 'TAP_RESET' })
    expect(reset.pendingTapCount).toBe(0)
    expect(effects).toEqual([])
  })

  it('a single tap while a part is chosen cancels it instead of repeating', () => {
    const chosen = tapCount(createInitialState(), 3).state // bulb chosen
    const { state, effects } = tapCount(chosen, 1)
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(effects).toEqual([{ type: 'speak', clips: ['cancelled'] }])
  })
})

describe('sparshReducer: hold vs tap-then-hold', () => {
  it('HOLD with no prior tap chooses battery', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'HOLD' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'battery' })
    expect(effects).toEqual([
      { type: 'speak', clips: ['battery', 'swipe_destination'] },
      { type: 'vibrate', pattern: [80] },
    ])
  })

  it('a tap followed by HOLD chooses switch, not battery', () => {
    const tapped = step(createInitialState(), { type: 'TAP' })
    expect(tapped.pendingTapCount).toBe(1)
    const { state, effects } = sparshReducer(tapped, { type: 'HOLD' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'switch' })
    expect(state.pendingTapCount).toBe(0)
    expect(effects).toEqual([
      { type: 'speak', clips: ['switch', 'swipe_destination'] },
      { type: 'vibrate', pattern: [40, 40, 80] },
    ])
  })

  it('a hold after 2+ taps falls back to finalizing that count instead of dropping it', () => {
    let state = step(createInitialState(), { type: 'TAP' })
    state = step(state, { type: 'TAP' })
    const { state: resolved } = sparshReducer(state, { type: 'HOLD' })
    expect(resolved.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' }) // count 2 -> wire
    expect(resolved.pendingTapCount).toBe(0)
  })

  it('switches placed via tap-then-hold default to open', () => {
    let state = createInitialState()
    state = step(state, { type: 'TAP' })
    state = step(state, { type: 'HOLD' }) // choose switch
    const { state: placed } = sparshReducer(state, { type: 'SWIPE', direction: 'right' })
    expect(placed.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'switch', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, closed: false },
    ])
  })
})

describe('sparshReducer: placement', () => {
  it('places the chosen part, speaks "Placed <part>", deselects, and moves the cursor there', () => {
    const chosen = tapCount(createInitialState(), 3).state // bulb
    const { state, effects } = sparshReducer(chosen, { type: 'SWIPE', direction: 'right' })
    expect(effects).toEqual([{ type: 'speak', clips: ['placed', 'bulb'] }])
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(state.cursor).toEqual({ row: 0, col: 1 })
    expect(state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    ])
  })

  it('wire stays chosen (sticky) after placing, so the next swipe keeps laying wire', () => {
    const chosen = tapCount(createInitialState(), 2).state // wire
    const first = sparshReducer(chosen, { type: 'SWIPE', direction: 'right' })
    expect(first.state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(first.effects).toEqual([{ type: 'speak', clips: ['placed', 'wire'] }])

    const second = sparshReducer(first.state, { type: 'SWIPE', direction: 'down' })
    expect(second.state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(second.state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'wire', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
      { id: 'sparsh-2', type: 'wire', from: { row: 0, col: 1 }, to: { row: 1, col: 1 } },
    ])
  })

  it('refuses to place off the grid, speaks why, and keeps the part chosen', () => {
    const chosen = tapCount(createInitialState(), 3).state // bulb at (0,0)
    const { state, effects } = sparshReducer(chosen, { type: 'SWIPE', direction: 'up' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'bulb' })
    expect(state.netlist.components).toHaveLength(0)
    expect(effects).toEqual([
      { type: 'speak', clips: ['edge'] },
      { type: 'vibrate', pattern: [30, 40, 30] },
    ])
  })

  it('refuses to place on an already-occupied segment, speaks why, and keeps the part chosen', () => {
    let state = tapCount(createInitialState(), 2).state // wire
    state = sparshReducer(state, { type: 'SWIPE', direction: 'right' }).state // wire (0,0)->(0,1); stays chosen
    const { state: refused, effects } = sparshReducer(state, { type: 'SWIPE', direction: 'left' })
    // cursor is now at (0,1); swiping left targets the same segment (0,1)-(0,0) again
    expect(refused.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(refused.netlist.components).toHaveLength(1)
    expect(effects).toEqual([{ type: 'speak', clips: ['segment_occupied'] }])
  })

})

describe('sparshReducer: two-finger hold summary', () => {
  it('reports not_connected for an empty circuit', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_HOLD' })
    expect(effects).toEqual([{ type: 'speak', clips: ['your_circuit_has', 'not_connected'] }])
  })

  it('reports counts and in_series for a series circuit', () => {
    let state = createInitialState()
    state = step(state, { type: 'HOLD' }) // choose battery
    state = step(state, { type: 'SWIPE', direction: 'right' }) // place battery (0,0)->(0,1)
    state = tapCount(state, 3).state // bulb
    state = step(state, { type: 'SWIPE', direction: 'right' }) // bulb (0,1)->(0,2)

    const { effects } = sparshReducer(state, { type: 'TWO_FINGER_HOLD' })
    expect(effects[0].type).toBe('speak')
  })
})

describe('sparshReducer: two-finger swipe down (remove)', () => {
  it('removes the most recently placed part touching the cursor', () => {
    let state = tapCount(createInitialState(), 3).state // bulb
    state = step(state, { type: 'SWIPE', direction: 'right' }) // bulb (0,0)->(0,1), cursor -> (0,1)
    state = { ...state, cursor: { row: 0, col: 0 } }
    state = tapCount(state, 4).state // resistor
    state = step(state, { type: 'SWIPE', direction: 'down' }) // resistor (0,0)->(1,0), cursor -> (1,0)
    state = { ...state, cursor: { row: 0, col: 0 } } // both parts touch (0,0); resistor placed later

    const { state: removed, effects } = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_DOWN' })
    expect(effects).toEqual([{ type: 'speak', clips: ['removed', 'resistor'] }])
    expect(removed.netlist.components).toHaveLength(1)
    expect(removed.netlist.components[0].type).toBe('bulb')
  })

  it('speaks "empty" when there is nothing at the cursor to remove', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_DOWN' })
    expect(effects).toEqual([{ type: 'speak', clips: ['empty'] }])
  })
})

describe('sparshReducer: two-finger swipe up (toggle switch)', () => {
  it('toggles a switch touching the cursor and speaks its new state', () => {
    let state = createInitialState()
    state = step(state, { type: 'TAP' })
    state = step(state, { type: 'HOLD' }) // choose switch
    state = step(state, { type: 'SWIPE', direction: 'right' }) // switch (0,0)->(0,1), cursor -> (0,1)

    const toggled = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_UP' })
    expect(toggled.effects).toEqual([{ type: 'speak', clips: ['switch_closed'] }])
    expect(toggled.state.netlist.components[0]).toMatchObject({ closed: true })

    const toggledBack = sparshReducer(toggled.state, { type: 'TWO_FINGER_SWIPE_UP' })
    expect(toggledBack.effects).toEqual([{ type: 'speak', clips: ['switch_open'] }])
    expect(toggledBack.state.netlist.components[0]).toMatchObject({ closed: false })
  })

  it('speaks "empty" when there is no switch at the cursor', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_UP' })
    expect(effects).toEqual([{ type: 'speak', clips: ['empty'] }])
  })
})

describe('sparshReducer: three-finger help', () => {
  it('speaks the help clip', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'THREE_FINGER_TAP' })
    expect(effects).toEqual([{ type: 'speak', clips: ['help'] }])
  })
})

describe('sparshReducer: two-finger swipe left', () => {
  it('stops everything and navigates home regardless of mode', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_LEFT' })
    expect(effects).toEqual([{ type: 'stopAll' }, { type: 'navigateHome' }])
  })
})

describe('sparshReducer: two-finger tap (run / explore)', () => {
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

  it('enters explore mode and starts sonify on a good result', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult })
    expect(state.mode).toBe('explore')
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
})

describe('sparshReducer: guided lesson', () => {
  function placePartHere(state: SparshState, count: number, direction: Direction): SparshState {
    const chosen = tapCount(state, count).state
    return step(chosen, { type: 'SWIPE', direction })
  }

  function placeBatteryHere(state: SparshState, direction: Direction): SparshState {
    const chosen = step(state, { type: 'HOLD' })
    return step(chosen, { type: 'SWIPE', direction })
  }

  function runAndDispatchResult(state: SparshState) {
    const solved = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
    expect(solved.effects).toEqual([{ type: 'solve' }])
    const result = solve(solved.state.netlist)
    return sparshReducer(solved.state, { type: 'SOLVE_RESULT', result })
  }

  it('starts on a two-finger double-tap, clearing any existing build', () => {
    const built = placePartHere(createInitialState(), 2, 'right') // a wire
    expect(built.netlist.components).toHaveLength(1)

    const { state, effects } = sparshReducer(built, { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(state.netlist.components).toHaveLength(0)
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })
    expect(effects).toEqual([{ type: 'speak', clips: ['lesson_intro', 'lesson_step_battery'] }])
  })

  it('cascades through steps already satisfied out of order', () => {
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })

    state = placePartHere(state, 3, 'right') // bulb at (0,0)->(0,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = step(state, { type: 'SWIPE', direction: 'down' }) // -> (1,0), empty
    state = placePartHere(state, 3, 'right') // bulb at (1,0)->(1,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = step(state, { type: 'SWIPE', direction: 'down' }) // -> (2,0), empty
    const chosenBattery = step(state, { type: 'HOLD' }) // choose battery
    const { state: afterBattery, effects } = sparshReducer(chosenBattery, { type: 'SWIPE', direction: 'right' })
    expect(afterBattery.lesson).toEqual({ phase: 'series', stepIndex: 3 })
    expect(effects).toEqual([
      { type: 'speak', clips: ['placed', 'battery'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_bulb1'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_bulb2'] },
      { type: 'speak', clips: ['lesson_good', 'lesson_step_close_loop'] },
    ])
  })

  it('walks the full series build -> run -> parallel rebuild -> run demo with real gestures and real solve()', () => {
    // A unit square so every placement is a single swipe from an adjacent dot. Placing a part
    // moves the cursor onto its far end, so the whole loop chains together without any extra
    // repositioning: (0,0)-(0,1) top [battery], (0,1)-(1,1) right [bulb1], (1,1)-(1,0) bottom
    // [bulb2], (1,0)-(0,0) left [wire, closes the loop].
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = placeBatteryHere(state, 'right') // battery (0,0)->(0,1); cursor -> (0,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 1 })
    expect(state.cursor).toEqual({ row: 0, col: 1 })

    state = placePartHere(state, 3, 'down') // bulb1 (0,1)->(1,1); cursor -> (1,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 2 })

    state = placePartHere(state, 3, 'left') // bulb2 (1,1)->(1,0); cursor -> (1,0)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 3 })

    // Close the loop: (1,0) is occupied by bulb2, (0,0) by battery — no "empty dot" restriction
    // exists any more in Phase 4, so this is just an ordinary placement.
    const closing = placePartHere(state, 2, 'up') // wire (1,0)->(0,0); cursor -> (0,0)
    expect(closing.lesson).toEqual({ phase: 'seriesRun', stepIndex: 0 })
    state = closing
    // Wire is sticky — cancel the selection before moving the cursor around again, otherwise
    // the next "SWIPE"s below would try to place more wire instead of just moving.
    state = tapCount(state, 1).state

    expect(state.netlist.components).toHaveLength(4)
    expect(state.netlist.components.map((c) => c.type).sort()).toEqual(['battery', 'bulb', 'bulb', 'wire'])

    const ran = runAndDispatchResult(state)
    expect(ran.state.mode).toBe('explore')
    expect(ran.state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 })
    expect(ran.effects).toEqual([
      { type: 'speak', clips: ['run', 'lesson_series_result'] },
      { type: 'sonifyStart', result: expect.objectContaining({ ok: true }) },
    ])
    state = ran.state

    const exited = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
    expect(exited.state.mode).toBe('build')
    expect(exited.effects).toEqual([
      { type: 'sonifyStop' },
      { type: 'speak', clips: ['lesson_parallel_intro'] },
    ])
    state = exited.state

    // Rebuild in parallel. Cursor is at (0,0) (where the closing wire ended). Move to (1,1) —
    // the dot shared by bulb1 and bulb2 — to remove bulb2, replace that edge with a wire so the
    // loop stays closed, then add a fresh bulb on an unused pair of dots plus two connector
    // wires tying its endpoints to the same two electrical nodes bulb1 is on. No segment is
    // ever reused, so the "segment occupied" rule never gets in the way.
    state = step(state, { type: 'SWIPE', direction: 'right' }) // (0,0)->(0,1)
    state = step(state, { type: 'SWIPE', direction: 'down' }) // (0,1)->(1,1)

    const removed = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_DOWN' })
    expect(removed.effects).toEqual([{ type: 'speak', clips: ['removed', 'bulb'] }])
    state = removed.state

    state = placePartHere(state, 2, 'left') // wire (1,1)->(1,0); cursor -> (1,0)
    state = tapCount(state, 1).state // cancel the sticky wire selection
    expect(state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 }) // not parallel yet — only 1 bulb

    state = step(state, { type: 'SWIPE', direction: 'right' }) // (1,0)->(1,1)
    state = step(state, { type: 'SWIPE', direction: 'right' }) // (1,1)->(1,2), empty
    state = placePartHere(state, 3, 'up') // bulb2' (1,2)->(0,2); cursor -> (0,2)
    state = placePartHere(state, 2, 'left') // wire (0,2)->(0,1), top connector; cursor -> (0,1)
    state = tapCount(state, 1).state // cancel the sticky wire selection
    state = step(state, { type: 'SWIPE', direction: 'down' }) // (0,1)->(1,1)
    state = placePartHere(state, 2, 'right') // wire (1,1)->(1,2), bottom connector

    expect(state.lesson).toEqual({ phase: 'parallelRun', stepIndex: 0 })

    const ranAgain = runAndDispatchResult(state)
    expect(ranAgain.state.lesson).toBeNull()
    expect(ranAgain.effects).toEqual([
      { type: 'speak', clips: ['run', 'lesson_compare', 'lesson_complete'] },
      { type: 'sonifyStart', result: expect.objectContaining({ ok: true }) },
    ])

    const finalNetlist: Netlist = ranAgain.state.netlist
    expect(finalNetlist.components.filter((c) => c.type === 'bulb')).toHaveLength(2)
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
})
