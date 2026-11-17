/**
 * src/learn/puzzles.ts — Fault Hunt puzzle definitions.
 *
 * Each puzzle contains:
 *  - id: unique identifier
 *  - promptClip: audio clip name to play after fault_intro
 *  - promptText: English fallback text for the prompt clip
 *  - brokenNetlist: the netlist with the fault
 *  - faultyId: id of the faulty component the student must tap
 *  - fixedNetlist: the netlist after the fix is applied
 *  - hintText: short English hint played after 2 wrong tries
 */
import type { Netlist } from '../contracts/netlist'

export interface FaultPuzzle {
  id: string
  promptClip: string
  promptText: string
  hintText: string
  brokenNetlist: Netlist
  faultyId: string
  fixedNetlist: Netlist
}

// ── Puzzle 1: one bulb is silent (broken/misconnected return wire) ──────
// Battery → bulb1 → bulb2 → wire1 (loose/disconnected to row 1 instead of returning to battery)
const PUZZLE_1_BROKEN: Netlist = {
  gridSize: 4,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
  ],
}

const PUZZLE_1_FIXED: Netlist = {
  gridSize: 4,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
  ],
}

// ── Puzzle 2: nothing lights up (switch left open) ───────────────
const PUZZLE_2_BROKEN: Netlist = {
  gridSize: 4,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
  ],
}

const PUZZLE_2_FIXED: Netlist = {
  gridSize: 4,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: true },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
  ],
}

// ── Puzzle 3: battery in danger — short circuit (direct wire across battery) ──
const PUZZLE_3_BROKEN: Netlist = {
  gridSize: 3,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
    // The fault: wire2 short-circuits the battery directly
    { id: 'wire2', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 0 } },
  ],
}

const PUZZLE_3_FIXED: Netlist = {
  gridSize: 3,
  source: 'build',
  components: [
    { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
  ],
}

export const FAULT_PUZZLES: FaultPuzzle[] = [
  {
    id: 'fault1',
    promptClip: 'fault_1',
    promptText: 'One bulb is silent. Something is wrong in the circuit. Tap the broken part.',
    hintText: 'Hint: is there a complete path back to the battery?',
    brokenNetlist: PUZZLE_1_BROKEN,
    faultyId: 'wire1',
    fixedNetlist: PUZZLE_1_FIXED,
  },
  {
    id: 'fault2',
    promptClip: 'fault_2',
    promptText: 'Nothing lights up. Find out why and tap the broken part.',
    hintText: 'Hint: check the switch — is it open or closed?',
    brokenNetlist: PUZZLE_2_BROKEN,
    faultyId: 'switch1',
    fixedNetlist: PUZZLE_2_FIXED,
  },
  {
    id: 'fault3',
    promptClip: 'fault_3',
    promptText: 'Battery in danger! There is a short circuit. Tap the wire causing it.',
    hintText: 'Hint: look for a wire that connects directly across the battery.',
    brokenNetlist: PUZZLE_3_BROKEN,
    faultyId: 'wire2',
    fixedNetlist: PUZZLE_3_FIXED,
  },
]
