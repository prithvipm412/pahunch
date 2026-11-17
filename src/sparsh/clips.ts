import type { ComponentType } from '../contracts/netlist'

// Clip names and English fallback text for speechSynthesis, until recorded audio ships under
// public/audio/<lang>/<name>.mp3. Keep names stable — the recorded clips will reuse them.
export const CLIPS = {
  welcome: 'Sparsh mode. Build a circuit by touch and sound.',
  talkback_hint:
    'Swipe to move. Double tap to place or edit a part. Long press for a summary. Two finger tap to run. Two finger double tap for a guided lesson.',
  grid_intro: 'This is a 5 by 5 grid. You are at row 1, column 1.',
  edge: "You're at the edge.",
  empty: 'empty',
  menu_open: 'Choose a part. Swipe to hear your choices. Double tap to pick.',
  battery: 'battery',
  bulb: 'bulb',
  resistor: 'resistor',
  switch: 'switch',
  wire: 'wire',
  wire_direction: 'Now swipe the direction to place it.',
  placed: 'placed',
  removed: 'removed',
  switch_open: 'switch, open',
  switch_closed: 'switch, closed',
  your_circuit_has: 'Your circuit has',
  in_series: 'connected in series',
  in_parallel: 'connected in parallel',
  not_connected: 'not yet a complete circuit',
  run: 'running your circuit',
  state_off: 'off',
  state_dim: 'dim',
  state_normal: 'normal',
  state_bright: 'bright',
  state_overload: 'overloaded',
  short_circuit: 'short circuit. Remove a wire and try again.',
  open_circuit: 'this circuit is not closed yet.',
  nothing_to_run: 'add a battery and a part before running.',
  n1: 'one',
  n2: 'two',
  n3: 'three',
  n4: 'four',
  n5: 'five',
  pos_r1c1: 'row 1, column 1',
  pos_r1c2: 'row 1, column 2',
  pos_r1c3: 'row 1, column 3',
  pos_r1c4: 'row 1, column 4',
  pos_r1c5: 'row 1, column 5',
  pos_r2c1: 'row 2, column 1',
  pos_r2c2: 'row 2, column 2',
  pos_r2c3: 'row 2, column 3',
  pos_r2c4: 'row 2, column 4',
  pos_r2c5: 'row 2, column 5',
  pos_r3c1: 'row 3, column 1',
  pos_r3c2: 'row 3, column 2',
  pos_r3c3: 'row 3, column 3',
  pos_r3c4: 'row 3, column 4',
  pos_r3c5: 'row 3, column 5',
  pos_r4c1: 'row 4, column 1',
  pos_r4c2: 'row 4, column 2',
  pos_r4c3: 'row 4, column 3',
  pos_r4c4: 'row 4, column 4',
  pos_r4c5: 'row 4, column 5',
  pos_r5c1: 'row 5, column 1',
  pos_r5c2: 'row 5, column 2',
  pos_r5c3: 'row 5, column 3',
  pos_r5c4: 'row 5, column 4',
  pos_r5c5: 'row 5, column 5',

  // Phase 3: guided lesson (1 battery, 2 bulbs — build in series, run, rebuild in parallel).
  lesson_intro: "Let's build your first circuit together. I'll guide you, one step at a time.",
  lesson_step_battery: 'First, place a battery.',
  lesson_step_bulb1: 'Now add a bulb next to it.',
  lesson_step_bulb2: 'Now add another bulb.',
  lesson_step_close_loop: 'Now connect a wire to close the loop.',
  lesson_good: 'Good.',
  lesson_series_ready: "Your circuit is ready. Two finger tap to run it and listen.",
  lesson_series_result:
    "That's the hum of two bulbs in series. Two finger tap again when you're ready to rebuild it in parallel.",
  lesson_parallel_intro:
    'Now rebuild this in parallel. Move one bulb so it connects between the same two dots as the other bulb, then wire the loop closed again.',
  lesson_parallel_ready: 'Your parallel circuit is ready. Two finger tap to run it.',
  lesson_compare: 'Listen. In parallel, both bulbs shine at full brightness, and the hum is louder.',
  lesson_complete: 'You finished the guided lesson. Great work.',
} as const

export type ClipName = keyof typeof CLIPS

export function fallbackFor(name: ClipName): string {
  return CLIPS[name]
}

export function posClipFor(row: number, col: number): ClipName {
  return `pos_r${row + 1}c${col + 1}` as ClipName
}

const COUNT_CLIPS: ClipName[] = ['n1', 'n2', 'n3', 'n4', 'n5']

export function countClipFor(count: number): ClipName | null {
  if (count < 1 || count > COUNT_CLIPS.length) return null
  return COUNT_CLIPS[count - 1]
}

export function partClipFor(type: ComponentType): ClipName {
  return type
}

export const PART_MENU_ORDER: ComponentType[] = ['battery', 'bulb', 'resistor', 'switch', 'wire']
