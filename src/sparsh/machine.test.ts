import { describe, expect, it } from 'vitest'
import type { Netlist, SolveResult } from '../contracts/netlist'
import { solve } from '../physics'
import { createInitialState, feedbackFor, sparshReducer, type Direction, type SparshState } from './machine'
import { PICKER_ORDER } from './gestureMap'
import type { ComponentType } from '../contracts/netlist'

function step(state: SparshState, event: Parameters<typeof sparshReducer>[1]) {
  return sparshReducer(state, event).state
}

// Opens/advances the picker with 1-finger double-taps until `partType` is chosen — the sequence
// index.tsx produces for a confirmed double-tap, repeated as many times as PICKER_ORDER needs.
function choosePart(state: SparshState, partType: ComponentType): SparshState {
  const index = PICKER_ORDER.indexOf(partType)
  let s = state
  for (let i = 0; i <= index; i++) s = step(s, { type: 'DOUBLE_TAP' })
  return s
}

// Chooses a part by the double-tap cycle and places it in `direction`.
function placePartHere(state: SparshState, partType: ComponentType, direction: Direction): SparshState {
  const chosen = choosePart(state, partType)
  return step(chosen, { type: 'SWIPE', direction })
}

function placeBatteryHere(state: SparshState, direction: Direction): SparshState {
  return placePartHere(state, 'battery', direction)
}

function runAndDispatchResult(state: SparshState) {
  const solved = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
  expect(solved.effects).toEqual([{ type: 'solve' }])
  const result = solve(solved.state.netlist)
  return sparshReducer(solved.state, { type: 'SOLVE_RESULT', result })
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
      { type: 'haptic', name: 'tap' },
      { type: 'delay', ms: 70 },
      { type: 'speak', clips: ['pos_r1c2', 'empty'] },
    ])
  })

  it('does not move past the edge and plays the edge effect', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SWIPE', direction: 'up' })
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(effects).toEqual([
      { type: 'haptic', name: 'invalid' },
      { type: 'delay', ms: 190 },
      { type: 'speak', clips: ['edge'] },
    ])
  })

  it('announces the part name when moving onto an occupied dot', () => {
    let state = createInitialState()
    state = placePartHere(state, 'resistor', 'right')

    const { effects } = sparshReducer(state, { type: 'SWIPE', direction: 'left' })
    expect(effects[2]).toEqual({ type: 'speak', clips: ['pos_r1c1', 'resistor'] })
  })
})

describe('sparshReducer: the one-finger cycle picker', () => {
  it('a single tap always speaks position and part, whether or not a part is chosen', () => {
    const idle = sparshReducer(createInitialState(), { type: 'SINGLE_TAP' })
    expect(idle.state.buildSub).toEqual({ kind: 'idle' })
    expect(idle.effects).toEqual([{ type: 'speak', clips: ['pos_r1c1', 'empty'] }])

    const chosen = choosePart(createInitialState(), 'bulb')
    const { state, effects } = sparshReducer(chosen, { type: 'SINGLE_TAP' })
    // Never cancels the chosen part — that's HOLD's job now.
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'bulb' })
    expect(effects).toEqual([{ type: 'speak', clips: ['pos_r1c1', 'empty'] }])
  })

  it('the first double-tap from idle always opens on wire', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'DOUBLE_TAP' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(effects).toEqual([
      { type: 'haptic', name: 'place_wire' },
      { type: 'delay', ms: 75 },
      { type: 'speak', clips: ['wire', 'swipe_destination'] },
    ])
  })

  it('cycles through every part in order and loops back to wire', () => {
    let state = createInitialState()
    for (const partType of PICKER_ORDER) {
      state = step(state, { type: 'DOUBLE_TAP' })
      expect(state.buildSub).toEqual({ kind: 'partChosen', partType })
    }
    // One more double-tap after battery (the last in PICKER_ORDER) loops back to wire.
    state = step(state, { type: 'DOUBLE_TAP' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
  })

  it('resistor and switch are reachable and placeable, same as any other part', () => {
    const resistorState = placePartHere(createInitialState(), 'resistor', 'right')
    expect(resistorState.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'resistor', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    ])

    const switchState = placePartHere(createInitialState(), 'switch', 'down')
    expect(switchState.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'switch', from: { row: 0, col: 0 }, to: { row: 1, col: 0 }, closed: false },
    ])
  })

  it('long-press cancels an open picker and speaks "Cancelled"', () => {
    const chosen = choosePart(createInitialState(), 'resistor')
    const { state, effects } = sparshReducer(chosen, { type: 'HOLD' })
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(effects).toEqual([{ type: 'speak', clips: ['cancelled'] }])
  })

  it('long-press while idle (nothing to cancel) is a silent no-op', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'HOLD' })
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(effects).toEqual([])
  })

  it('double-tap on a placed switch toggles it instead of advancing the picker', () => {
    const placed = placePartHere(createInitialState(), 'switch', 'right') // (0,0)->(0,1), cursor -> (0,1)
    expect(placed.buildSub).toEqual({ kind: 'idle' })

    const toggled = sparshReducer(placed, { type: 'DOUBLE_TAP' })
    expect(toggled.state.buildSub).toEqual({ kind: 'idle' }) // picker untouched
    expect(toggled.state.netlist.components[0]).toMatchObject({ closed: true })
    expect(toggled.effects).toEqual([
      { type: 'haptic', name: 'toggle_switch' },
      { type: 'delay', ms: 90 },
      { type: 'speak', clips: ['switch_closed'] },
    ])

    const toggledBack = sparshReducer(toggled.state, { type: 'DOUBLE_TAP' })
    expect(toggledBack.state.netlist.components[0]).toMatchObject({ closed: false })
  })

  it('double-tap still opens the picker on an empty dot, even one a switch is on a neighbor of', () => {
    const placed = placePartHere(createInitialState(), 'switch', 'right') // switch at (0,0)-(0,1)
    const movedAway = step(placed, { type: 'SWIPE', direction: 'right' }) // cursor -> (0,2), empty
    const { state } = sparshReducer(movedAway, { type: 'DOUBLE_TAP' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
  })

  it('double-tap while a part is already chosen always advances the picker, even over a switch', () => {
    let state = placePartHere(createInitialState(), 'switch', 'right') // switch (0,0)-(0,1), cursor -> (0,1)
    state = step(state, { type: 'SWIPE', direction: 'right' }) // idle move -> cursor (0,2), empty
    state = step(state, { type: 'DOUBLE_TAP' }) // opens the picker on wire, cursor still (0,2)
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    state = step(state, { type: 'SWIPE', direction: 'left' }) // places wire (0,2)->(0,1); cursor -> (0,1), on the switch
    expect(state.cursor).toEqual({ row: 0, col: 1 })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' }) // wire is sticky

    // Now sitting on the switch, but a part is already chosen — this double-tap must advance
    // the picker (to bulb), not toggle the switch.
    const advanced = sparshReducer(state, { type: 'DOUBLE_TAP' })
    expect(advanced.state.buildSub).toEqual({ kind: 'partChosen', partType: 'bulb' })
    expect(advanced.state.netlist.components.find((c) => c.type === 'switch')).toMatchObject({ closed: false })
  })

  it('PICKER_IDLE_TIMEOUT silently closes an open picker, same as HOLD, but is a no-op from idle', () => {
    const idle = sparshReducer(createInitialState(), { type: 'PICKER_IDLE_TIMEOUT' })
    expect(idle.state.buildSub).toEqual({ kind: 'idle' })
    expect(idle.effects).toEqual([])

    const chosen = choosePart(createInitialState(), 'resistor')
    const { state, effects } = sparshReducer(chosen, { type: 'PICKER_IDLE_TIMEOUT' })
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(effects).toEqual([]) // unlike HOLD, this is a silent background cleanup
  })
})

describe('sparshReducer: placement', () => {
  it('places the chosen part, speaks "Placed <part>", deselects, and moves the cursor there', () => {
    const chosen = choosePart(createInitialState(), 'bulb')
    const { state, effects } = sparshReducer(chosen, { type: 'SWIPE', direction: 'right' })
    expect(effects).toEqual([
      { type: 'haptic', name: 'place_bulb' },
      { type: 'delay', ms: 90 },
      { type: 'speak', clips: ['placed', 'bulb'] },
    ])
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(state.cursor).toEqual({ row: 0, col: 1 })
    expect(state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    ])
  })

  it('wire stays chosen (sticky) after placing, so the next swipe keeps laying wire', () => {
    const chosen = choosePart(createInitialState(), 'wire')
    const first = sparshReducer(chosen, { type: 'SWIPE', direction: 'right' })
    expect(first.state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(first.effects).toEqual([
      { type: 'haptic', name: 'place_wire' },
      { type: 'delay', ms: 75 },
      { type: 'speak', clips: ['placed', 'wire'] },
    ])

    const second = sparshReducer(first.state, { type: 'SWIPE', direction: 'down' })
    expect(second.state.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(second.state.netlist.components).toEqual([
      { id: 'sparsh-1', type: 'wire', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
      { id: 'sparsh-2', type: 'wire', from: { row: 0, col: 1 }, to: { row: 1, col: 1 } },
    ])
  })

  it('refuses to place off the grid, speaks why, and keeps the part chosen', () => {
    const chosen = choosePart(createInitialState(), 'bulb')
    const { state, effects } = sparshReducer(chosen, { type: 'SWIPE', direction: 'up' })
    expect(state.buildSub).toEqual({ kind: 'partChosen', partType: 'bulb' })
    expect(state.netlist.components).toHaveLength(0)
    expect(effects).toEqual([
      { type: 'haptic', name: 'invalid' },
      { type: 'delay', ms: 190 },
      { type: 'speak', clips: ['edge'] },
    ])
  })

  it('moves onto an already-occupied segment, names the part there, keeps the part chosen, and does not place', () => {
    let state = choosePart(createInitialState(), 'wire')
    state = sparshReducer(state, { type: 'SWIPE', direction: 'right' }).state // wire (0,0)->(0,1); stays chosen
    const { state: refused, effects } = sparshReducer(state, { type: 'SWIPE', direction: 'left' })
    // cursor is now at (0,1); swiping left targets the same segment (0,1)-(0,0) again
    expect(refused.buildSub).toEqual({ kind: 'partChosen', partType: 'wire' })
    expect(refused.netlist.components).toHaveLength(1)
    expect(refused.netlist).toBe(state.netlist) // unchanged, not a new object
    expect(refused.cursor).toEqual({ row: 0, col: 0 }) // cursor moved anyway
    expect(effects).toEqual([
      { type: 'haptic', name: 'invalid' },
      { type: 'delay', ms: 190 },
      { type: 'speak', clips: ['already_wire'] },
    ])
  })
})

describe('sparshReducer: two-finger value cycling', () => {
  it('cycles a placed resistor through 5/10/20/50/100 ohms and loops', () => {
    let state = placePartHere(createInitialState(), 'resistor', 'right') // cursor -> (0,1), on the resistor
    const expected = [20, 50, 100, 5, 10] // starts from the 10-ohm default, so the first step is 20
    for (const value of expected) {
      const { state: next, effects } = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
      expect(next.netlist.components[0].value).toBe(value)
      expect(effects[0]).toEqual({ type: 'haptic', name: 'select' })
      state = next
    }
  })

  it('cycles a placed battery through 1.5/3/4.5/6/9 volts and loops', () => {
    let state = placeBatteryHere(createInitialState(), 'right') // cursor -> (0,1), on the battery
    const expected = [4.5, 6, 9, 1.5, 3] // starts from the 3-volt default
    for (const value of expected) {
      const { state: next } = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
      expect(next.netlist.components[0].value).toBe(value)
      state = next
    }
  })

  it('speaks the part and its new value', () => {
    const placed = placePartHere(createInitialState(), 'resistor', 'right')
    const { effects } = sparshReducer(placed, { type: 'TWO_FINGER_TAP' })
    expect(effects).toEqual([
      { type: 'haptic', name: 'select' },
      { type: 'speak', clips: ['resistor', 'ohms_20'] },
    ])
  })

  it('does not clash with run: two-finger tap away from a resistor/battery still runs', () => {
    const placed = placePartHere(createInitialState(), 'resistor', 'right') // cursor -> (0,1)
    const movedAway = step(placed, { type: 'SWIPE', direction: 'right' }) // cursor -> (0,2), empty
    const { effects } = sparshReducer(movedAway, { type: 'TWO_FINGER_TAP' })
    expect(effects).toEqual([{ type: 'solve' }])
  })

  it('does not cycle a wire, bulb, or switch at the cursor — two-finger tap there still runs', () => {
    const placed = placePartHere(createInitialState(), 'switch', 'right') // cursor -> (0,1), on the switch
    const { effects } = sparshReducer(placed, { type: 'TWO_FINGER_TAP' })
    expect(effects).toEqual([{ type: 'solve' }])
  })

  it('does not clash with run even when the cursor later rests back on an earlier resistor/battery', () => {
    // The resistor is placed first, then something else — so it's no longer the LAST placed
    // component when the cursor later happens to land back on its dot (e.g. closing a loop).
    let state = placePartHere(createInitialState(), 'resistor', 'right') // resistor (0,0)->(0,1), cursor -> (0,1)
    state = placePartHere(state, 'wire', 'down') // wire (0,1)->(1,1), cursor -> (1,1)
    state = step(state, { type: 'SWIPE', direction: 'left' }) // idle move -> cursor (1,0)
    state = step(state, { type: 'SWIPE', direction: 'up' }) // idle move -> cursor (0,0), back on the resistor

    const { effects } = sparshReducer(state, { type: 'TWO_FINGER_TAP' })
    expect(effects).toEqual([{ type: 'solve' }])
  })

  it('an undo after cycling restores the previous value', () => {
    const placed = placePartHere(createInitialState(), 'resistor', 'right')
    const cycled = sparshReducer(placed, { type: 'TWO_FINGER_TAP' }).state // 10 -> 20
    expect(cycled.netlist.components[0].value).toBe(20)

    const undone = sparshReducer(cycled, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(undone.state.netlist.components[0].value).toBeUndefined() // back to the (unset) default
  })
})

describe('sparshReducer: two-finger hold summary', () => {
  it('reports not_connected for an empty circuit', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_HOLD' })
    expect(effects).toEqual([{ type: 'speak', clips: ['your_circuit_has', 'not_connected'] }])
  })

  it('reports counts and in_series for a series circuit', () => {
    let state = placeBatteryHere(createInitialState(), 'right') // battery (0,0)->(0,1)
    state = placePartHere(state, 'bulb', 'right') // bulb (0,1)->(0,2)

    const { effects } = sparshReducer(state, { type: 'TWO_FINGER_HOLD' })
    expect(effects[0].type).toBe('speak')
  })
})

describe('sparshReducer: two-finger swipe down (remove)', () => {
  it('removes the most recently placed part touching the cursor', () => {
    let state = placePartHere(createInitialState(), 'bulb', 'right') // bulb (0,0)->(0,1), cursor -> (0,1)
    state = { ...state, cursor: { row: 0, col: 0 } }
    state = placePartHere(state, 'resistor', 'down') // resistor (0,0)->(1,0), cursor -> (1,0)
    state = { ...state, cursor: { row: 0, col: 0 } } // both parts touch (0,0); resistor placed later

    const { state: removed, effects } = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_DOWN' })
    expect(effects).toEqual([
      { type: 'haptic', name: 'delete' },
      { type: 'delay', ms: 160 },
      { type: 'speak', clips: ['removed', 'resistor'] },
    ])
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
    const state = placePartHere(createInitialState(), 'switch', 'right') // switch (0,0)->(0,1), cursor -> (0,1)

    const toggled = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_UP' })
    expect(toggled.effects).toEqual([
      { type: 'haptic', name: 'toggle_switch' },
      { type: 'delay', ms: 90 },
      { type: 'speak', clips: ['switch_closed'] },
    ])
    expect(toggled.state.netlist.components[0]).toMatchObject({ closed: true })

    const toggledBack = sparshReducer(toggled.state, { type: 'TWO_FINGER_SWIPE_UP' })
    expect(toggledBack.effects).toEqual([
      { type: 'haptic', name: 'toggle_switch' },
      { type: 'delay', ms: 90 },
      { type: 'speak', clips: ['switch_open'] },
    ])
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

describe('sparshReducer: two-finger swipe left (exit, with confirmation)', () => {
  it('the first swipe left only asks for confirmation — it does not leave', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_LEFT', now: 1000 })
    expect(state.pendingExitAt).toBe(1000)
    expect(effects).toEqual([{ type: 'speak', clips: ['exit_confirm'] }])
  })

  it('a second swipe left within 3 seconds confirms and leaves', () => {
    const first = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_LEFT', now: 1000 })
    const { state, effects } = sparshReducer(first.state, { type: 'TWO_FINGER_SWIPE_LEFT', now: 3999 })
    expect(state.pendingExitAt).toBeNull()
    expect(effects).toEqual([{ type: 'stopAll' }, { type: 'navigateHome' }])
  })

  it('resets silently if the second swipe left comes more than 3 seconds later', () => {
    const first = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_LEFT', now: 1000 })
    const { state, effects } = sparshReducer(first.state, { type: 'TWO_FINGER_SWIPE_LEFT', now: 4001 })
    // Not confirmed — treated as a fresh first swipe, asking for confirmation again.
    expect(state.pendingExitAt).toBe(4001)
    expect(effects).toEqual([{ type: 'speak', clips: ['exit_confirm'] }])
  })

  it('never moves the cursor', () => {
    const start = createInitialState()
    const { state } = sparshReducer(start, { type: 'TWO_FINGER_SWIPE_LEFT', now: 1000 })
    expect(state.cursor).toEqual(start.cursor)
  })
})

describe('sparshReducer: browser back interception', () => {
  it('speaks the leave-hint and does not change state', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'BACK_INTERCEPTED' })
    expect(state).toEqual(createInitialState())
    expect(effects).toEqual([{ type: 'speak', clips: ['exit_blocked_back'] }])
  })
})

describe('sparshReducer: two-finger swipe right (undo)', () => {
  function placeBulbAt00(state: SparshState) {
    return placePartHere(state, 'bulb', 'right')
  }

  it('says "Nothing to undo" when history is empty', () => {
    const { effects } = sparshReducer(createInitialState(), { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(effects).toEqual([{ type: 'speak', clips: ['nothing_to_undo'] }])
  })

  it('undoes a placement: the part disappears and the cursor is restored', () => {
    const placed = placeBulbAt00(createInitialState())
    expect(placed.netlist.components).toHaveLength(1)
    expect(placed.cursor).toEqual({ row: 0, col: 1 })

    const { state, effects } = sparshReducer(placed, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(state.netlist.components).toHaveLength(0)
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.history).toHaveLength(0)
    expect(effects).toEqual([
      { type: 'haptic', name: 'undo' },
      { type: 'delay', ms: 140 },
      { type: 'speak', clips: ['undone', 'bulb', 'removed_suffix', 'pos_r1c1'] },
    ])
  })

  it('undoes a removal: the part comes back', () => {
    const placed = placeBulbAt00(createInitialState())
    const removed = sparshReducer(placed, { type: 'TWO_FINGER_SWIPE_DOWN' }).state
    expect(removed.netlist.components).toHaveLength(0)

    const { state, effects } = sparshReducer(removed, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(state.netlist.components).toEqual(placed.netlist.components)
    expect(effects[2]).toEqual({ type: 'speak', clips: ['undone', 'bulb', 'is_back', 'pos_r1c2'] })
  })

  it('undoes a toggle: the switch reverts to its previous state', () => {
    const state = placePartHere(createInitialState(), 'switch', 'right') // switch (0,0)->(0,1), closed: false

    const toggled = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_UP' })
    expect(toggled.state.netlist.components[0]).toMatchObject({ closed: true })

    const undone = sparshReducer(toggled.state, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(undone.state.netlist.components[0]).toMatchObject({ closed: false })
    // The switch was placed from (0,0) to (0,1), which moved the cursor to (0,1); toggling
    // doesn't move it, so that's where it still is before and after the undo.
    expect(undone.effects[2]).toEqual({ type: 'speak', clips: ['undone', 'switch_open', 'pos_r1c2'] })
  })

  it('several undos in a row walk all the way back', () => {
    let state = placeBulbAt00(createInitialState())
    state = placePartHere(state, 'resistor', 'down') // resistor, cursor advances

    expect(state.netlist.components).toHaveLength(2)

    const undoneOnce = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_RIGHT' }).state
    expect(undoneOnce.netlist.components).toHaveLength(1)

    const undoneTwice = sparshReducer(undoneOnce, { type: 'TWO_FINGER_SWIPE_RIGHT' }).state
    expect(undoneTwice.netlist.components).toHaveLength(0)
    expect(undoneTwice.history).toHaveLength(0)

    const undoneThrice = sparshReducer(undoneTwice, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(undoneThrice.effects).toEqual([{ type: 'speak', clips: ['nothing_to_undo'] }])
  })

  it('caps history at 50 entries', () => {
    let state = createInitialState()
    // Lay 60 wires in a long zig-zag so every placement is legal (a straight line would run off
    // a 5-wide grid quickly — zig-zag stays in bounds).
    const directions: Array<'right' | 'down' | 'left' | 'up'> = ['right', 'down', 'left', 'down']
    let di = 0
    for (let i = 0; i < 60; i++) {
      const chosen = choosePart(state, 'wire')
      const direction = directions[di % directions.length]
      const placed = sparshReducer(chosen, { type: 'SWIPE', direction })
      if (placed.effects.some((e) => e.type === 'speak' && e.clips.includes('edge'))) {
        di++
        continue
      }
      state = placed.state
      di++
    }
    expect(state.history.length).toBeLessThanOrEqual(50)
  })

  it('while a part is chosen, undo only cancels the choice and leaves history untouched', () => {
    const placed = placeBulbAt00(createInitialState())
    const historyBefore = placed.history
    const chosen = choosePart(placed, 'wire')

    const { state, effects } = sparshReducer(chosen, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(state.buildSub).toEqual({ kind: 'idle' })
    expect(state.history).toBe(historyBefore)
    expect(state.netlist.components).toHaveLength(1) // the bulb is still there, untouched
    expect(effects).toEqual([{ type: 'speak', clips: ['cancelled'] }])
  })

  it('in explore mode, undo first stops the run, then undoes', () => {
    // A lone bulb has no battery and wouldn't actually solve ok — construct the "exploring"
    // state directly (as other describe blocks in this file do) rather than needing a full
    // buildable valid circuit just to exercise the mode-toggle-then-undo interaction.
    const placed = placeBulbAt00(createInitialState())
    const exploring: SparshState = {
      ...placed,
      mode: 'explore',
      explore: { point: placed.cursor, overComponentId: null },
      lastResult: { ok: true, errors: [], warnings: [], components: [] },
    }

    const { state, effects } = sparshReducer(exploring, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(state.mode).toBe('build')
    expect(state.netlist.components).toHaveLength(0)
    expect(effects[0]).toEqual({ type: 'sonifyStop' })
    expect(effects[1]).toEqual({ type: 'haptic', name: 'undo' })
    expect(effects[3]).toEqual({ type: 'speak', clips: ['undone', 'bulb', 'removed_suffix', 'pos_r1c1'] })
  })

  it('works during the guided lesson: undoing re-derives the current step from the netlist', () => {
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })
    state = placeBatteryHere(state, 'right')
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 1 })

    const undone = sparshReducer(state, { type: 'TWO_FINGER_SWIPE_RIGHT' })
    expect(undone.state.netlist.components).toHaveLength(0)
    expect(undone.state.lesson).toEqual({ phase: 'series', stepIndex: 0 })
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

  it('enters explore mode and starts sonify on a good result (no generic "running" speech any more)', () => {
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: okResult })
    expect(state.mode).toBe('explore')
    expect(effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'working' },
      { type: 'delay', ms: 660 }, // circuit_working pattern (600) + SPEECH_AFTER_HAPTIC_MS (60)
      { type: 'sonifyStart', result: okResult },
    ])
  })

  it('reports "broken" for an individually overloaded bulb, still with no generic result speech', () => {
    const overloadResult: SolveResult = {
      ok: true,
      errors: [],
      warnings: [],
      components: [{ id: 'bulb1', voltage: 9, current: 0.9, power: 8, state: 'overload' }],
    }
    const { state, effects } = sparshReducer(createInitialState(), { type: 'SOLVE_RESULT', result: overloadResult })
    expect(state.mode).toBe('explore')
    expect(effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'broken' },
      { type: 'delay', ms: 540 }, // circuit_broken pattern (480) + 60
      { type: 'sonifyStart', result: overloadResult },
    ])
  })

  it('reports "not_working" for an empty circuit and "broken" for a short circuit, each still ending in sonifyStart', () => {
    const empty = sparshReducer(createInitialState(), {
      type: 'SOLVE_RESULT',
      result: { ok: false, errors: ['empty'], warnings: [], components: [] },
    })
    expect(empty.effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'not_working' },
      { type: 'delay', ms: 140 }, // circuit_not_working pattern (80) + 60
      { type: 'speak', clips: ['nothing_to_run'] },
      { type: 'sonifyStart', result: empty.state.lastResult! },
    ])

    const shorted = sparshReducer(createInitialState(), {
      type: 'SOLVE_RESULT',
      result: { ok: false, errors: ['short_circuit'], warnings: [], components: [] },
    })
    expect(shorted.effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'broken' },
      { type: 'delay', ms: 540 },
      { type: 'speak', clips: ['short_circuit'] },
      { type: 'sonifyStart', result: shorted.state.lastResult! },
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
    expect(onPart.effects).toEqual([{ type: 'haptic', name: 'select' }])

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

describe('feedbackFor: pure (event, solveResult) -> circuit-status mapping', () => {
  it('is null for every event other than SOLVE_RESULT', () => {
    expect(feedbackFor({ type: 'SINGLE_TAP' })).toBeNull()
    expect(feedbackFor({ type: 'TWO_FINGER_TAP' })).toBeNull()
    expect(feedbackFor({ type: 'SWIPE', direction: 'up' })).toBeNull()
  })

  it('reports "working" for an ok result with no overloaded components', () => {
    const result: SolveResult = { ok: true, errors: [], warnings: [], components: [{ id: 'b1', voltage: 3, current: 0.3, power: 0.9, state: 'normal' }] }
    expect(feedbackFor({ type: 'SOLVE_RESULT', result })).toBe('working')
  })

  it('reports "not_working" for empty/no_battery/open_circuit results', () => {
    expect(feedbackFor({ type: 'SOLVE_RESULT', result: { ok: false, errors: ['empty'], warnings: [], components: [] } })).toBe('not_working')
    expect(feedbackFor({ type: 'SOLVE_RESULT', result: { ok: false, errors: ['no_battery'], warnings: [], components: [] } })).toBe('not_working')
    expect(feedbackFor({ type: 'SOLVE_RESULT', result: { ok: false, errors: ['open_circuit'], warnings: [], components: [] } })).toBe('not_working')
  })

  it('reports "broken" for a short circuit or any overloaded bulb', () => {
    expect(feedbackFor({ type: 'SOLVE_RESULT', result: { ok: false, errors: ['short_circuit'], warnings: [], components: [] } })).toBe('broken')
    const overloadResult: SolveResult = { ok: true, errors: [], warnings: [], components: [{ id: 'b1', voltage: 9, current: 0.9, power: 8, state: 'overload' }] }
    expect(feedbackFor({ type: 'SOLVE_RESULT', result: overloadResult })).toBe('broken')
  })

  it('accepts an explicit solveResult override as its second argument', () => {
    const event = { type: 'SOLVE_RESULT' as const, result: { ok: true, errors: [], warnings: [], components: [] } }
    const overrideResult: SolveResult = { ok: false, errors: ['short_circuit'], warnings: [], components: [] }
    expect(feedbackFor(event, overrideResult)).toBe('broken')
  })
})

describe('sparshReducer: guided lesson', () => {
  it('starts on a two-finger double-tap, clearing any existing build', () => {
    const built = placePartHere(createInitialState(), 'wire', 'right')
    expect(built.netlist.components).toHaveLength(1)

    const { state, effects } = sparshReducer(built, { type: 'TWO_FINGER_DOUBLE_TAP' })
    expect(state.netlist.components).toHaveLength(0)
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })
    expect(effects).toEqual([{ type: 'speak', clips: ['lesson_intro', 'lesson_step_battery'] }])
  })

  it('cascades through steps already satisfied out of order', () => {
    let state = step(createInitialState(), { type: 'TWO_FINGER_DOUBLE_TAP' })

    state = placePartHere(state, 'bulb', 'right') // bulb at (0,0)->(0,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = step(state, { type: 'SWIPE', direction: 'down' }) // -> (1,0), empty
    state = placePartHere(state, 'bulb', 'right') // bulb at (1,0)->(1,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 0 })

    state = step(state, { type: 'SWIPE', direction: 'down' }) // -> (2,0), empty
    const chosenBattery = choosePart(state, 'battery')
    const { state: afterBattery, effects } = sparshReducer(chosenBattery, { type: 'SWIPE', direction: 'right' })
    expect(afterBattery.lesson).toEqual({ phase: 'series', stepIndex: 3 })
    expect(effects).toEqual([
      { type: 'haptic', name: 'place_battery' },
      { type: 'delay', ms: 170 },
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

    state = placePartHere(state, 'bulb', 'down') // bulb1 (0,1)->(1,1); cursor -> (1,1)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 2 })

    state = placePartHere(state, 'bulb', 'left') // bulb2 (1,1)->(1,0); cursor -> (1,0)
    expect(state.lesson).toEqual({ phase: 'series', stepIndex: 3 })

    // Close the loop: (1,0) is occupied by bulb2, (0,0) by battery — no "empty dot" restriction
    // exists any more, so this is just an ordinary placement.
    const closing = placePartHere(state, 'wire', 'up') // wire (1,0)->(0,0); cursor -> (0,0)
    expect(closing.lesson).toEqual({ phase: 'seriesRun', stepIndex: 0 })
    state = closing
    // Wire is sticky — cancel the selection before moving the cursor around again, otherwise
    // the next "SWIPE"s below would try to place more wire instead of just moving.
    state = step(state, { type: 'HOLD' })

    expect(state.netlist.components).toHaveLength(4)
    expect(state.netlist.components.map((c) => c.type).sort()).toEqual(['battery', 'bulb', 'bulb', 'wire'])

    const ran = runAndDispatchResult(state)
    expect(ran.state.mode).toBe('explore')
    expect(ran.state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 })
    expect(ran.effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'working' },
      { type: 'delay', ms: 660 },
      { type: 'speak', clips: ['lesson_series_result'] },
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
    expect(removed.effects).toEqual([
      { type: 'haptic', name: 'delete' },
      { type: 'delay', ms: 160 },
      { type: 'speak', clips: ['removed', 'bulb'] },
    ])
    state = removed.state

    state = placePartHere(state, 'wire', 'left') // wire (1,1)->(1,0); cursor -> (1,0)
    state = step(state, { type: 'HOLD' }) // cancel the sticky wire selection
    expect(state.lesson).toEqual({ phase: 'parallel', stepIndex: 0 }) // not parallel yet — only 1 bulb

    state = step(state, { type: 'SWIPE', direction: 'right' }) // (1,0)->(1,1)
    state = step(state, { type: 'SWIPE', direction: 'right' }) // (1,1)->(1,2), empty
    state = placePartHere(state, 'bulb', 'up') // bulb2' (1,2)->(0,2); cursor -> (0,2)
    state = placePartHere(state, 'wire', 'left') // wire (0,2)->(0,1), top connector; cursor -> (0,1)
    state = step(state, { type: 'HOLD' }) // cancel the sticky wire selection
    state = step(state, { type: 'SWIPE', direction: 'down' }) // (0,1)->(1,1)
    state = placePartHere(state, 'wire', 'right') // wire (1,1)->(1,2), bottom connector

    expect(state.lesson).toEqual({ phase: 'parallelRun', stepIndex: 0 })

    const ranAgain = runAndDispatchResult(state)
    expect(ranAgain.state.lesson).toBeNull()
    expect(ranAgain.effects).toEqual([
      { type: 'speak', clips: ['run_starting'] },
      { type: 'circuitStatus', status: 'working' },
      { type: 'delay', ms: 660 },
      { type: 'speak', clips: ['lesson_compare', 'lesson_complete'] },
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
