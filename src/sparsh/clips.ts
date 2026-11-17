import type { ComponentType } from '../contracts/netlist'
import { buildHelpText } from './gestureMap'

// Clip names and English fallback text for speechSynthesis, until recorded audio ships under
// public/audio/<lang>/<name>.mp3. Keep names stable — the recorded clips will reuse them.
// Every clip here (plus the pos_r*c*/ohms_*/volts_* families, templated) is also listed in
// clips.csv.
export const CLIPS = {
  welcome: 'Sparsh mode. Build a circuit by touch and sound.',
  talkback_hint:
    'One finger: swipe to move, double tap to open the part picker, swipe to place it. Two fingers: tap to run, hold for a summary, swipe right to undo. Three finger tap any time for full help.',
  grid_intro: 'This is a 5 by 5 grid. You are at row 1, column 1. Double tap to choose a part, then swipe to place it. Three finger tap any time for help.',
  edge: 'Edge of the grid.',
  empty: 'empty',
  battery: 'battery',
  bulb: 'bulb',
  resistor: 'resistor',
  switch: 'switch',
  wire: 'wire',
  swipe_destination: 'Swipe where it should go.',
  placed: 'Placed',
  removed: 'Removed',
  cancelled: 'Cancelled.',
  segment_occupied: "There's already something there.",
  switch_open: 'Switch open.',
  switch_closed: 'Switch closed.',
  your_circuit_has: 'Your circuit has',
  in_series: 'connected in series',
  in_parallel: 'connected in parallel',
  not_connected: 'not yet a complete circuit',
  // Opens every run, replacing the old generic 'run' announcement entirely (see
  // docs/status/l1.md for why 'run' itself was dropped from the sequence).
  run_starting: 'Okay, running circuit.',
  state_off: 'off',
  state_dim: 'dim',
  state_normal: 'normal',
  state_bright: 'bright',
  state_overload: 'overloaded',
  short_circuit: 'short circuit. Remove a wire and try again.',
  open_circuit: 'this circuit is not closed yet.',
  nothing_to_run: 'add a battery and a part before running.',
  undone: 'Undone.',
  removed_suffix: 'removed.',
  is_back: 'is back.',
  nothing_to_undo: 'Nothing to undo.',
  exit_confirm: 'Swipe left again to leave.',
  exit_blocked_back: 'To leave, swipe left twice with two fingers.',
  // Generated from gestureMap.ts's GESTURE_MAP, so the spoken help and the visible cheat sheet
  // (rendered from the same map in index.tsx) can never drift apart.
  help: buildHelpText(),
  n1: 'one',
  n2: 'two',
  n3: 'three',
  n4: 'four',
  n5: 'five',
  pos_r1c1: 'Row 1, column 1.',
  pos_r1c2: 'Row 1, column 2.',
  pos_r1c3: 'Row 1, column 3.',
  pos_r1c4: 'Row 1, column 4.',
  pos_r1c5: 'Row 1, column 5.',
  pos_r2c1: 'Row 2, column 1.',
  pos_r2c2: 'Row 2, column 2.',
  pos_r2c3: 'Row 2, column 3.',
  pos_r2c4: 'Row 2, column 4.',
  pos_r2c5: 'Row 2, column 5.',
  pos_r3c1: 'Row 3, column 1.',
  pos_r3c2: 'Row 3, column 2.',
  pos_r3c3: 'Row 3, column 3.',
  pos_r3c4: 'Row 3, column 4.',
  pos_r3c5: 'Row 3, column 5.',
  pos_r4c1: 'Row 4, column 1.',
  pos_r4c2: 'Row 4, column 2.',
  pos_r4c3: 'Row 4, column 3.',
  pos_r4c4: 'Row 4, column 4.',
  pos_r4c5: 'Row 4, column 5.',
  pos_r5c1: 'Row 5, column 1.',
  pos_r5c2: 'Row 5, column 2.',
  pos_r5c3: 'Row 5, column 3.',
  pos_r5c4: 'Row 5, column 4.',
  pos_r5c5: 'Row 5, column 5.',

  // Resistor ohms and battery volts, spoken after a two-finger tap cycles a placed part's value
  // (see RESISTOR_VALUES / BATTERY_VALUES below). A fixed, finite set of clips, the same way the
  // pos_r*c* grid positions are, rather than live numeric speech.
  ohms_5: '5 ohms',
  ohms_10: '10 ohms',
  ohms_20: '20 ohms',
  ohms_50: '50 ohms',
  ohms_100: '100 ohms',
  volts_1_5: '1.5 volts',
  volts_3: '3 volts',
  volts_4_5: '4.5 volts',
  volts_6: '6 volts',
  volts_9: '9 volts',

  // Phase 3: guided lesson (1 battery, 2 bulbs — build in series, run, rebuild in parallel).
  // Phase 5 reworded the step instructions for the double-tap cycle picker (replacing the
  // tap-count/hold scheme); the step-detection logic (which netlist shape counts as "done") is
  // unchanged.
  lesson_intro:
    "Let's build your first circuit together. I'll guide you, one step at a time. If you make a mistake, " +
    'swipe right with two fingers to undo.',
  lesson_step_battery: 'First, place a battery. Double tap until you hear Battery, then swipe where it should go.',
  lesson_step_bulb1: 'Now add a bulb. Double tap until you hear Bulb, then swipe where it should go.',
  lesson_step_bulb2: 'Now add another bulb. Double tap until you hear Bulb, then swipe where it should go.',
  lesson_step_close_loop: 'Now close the loop with a wire. Double tap once for Wire, then swipe to place it.',
  lesson_good: 'Good.',
  lesson_series_ready: 'Your circuit is ready. Two finger tap to run it and listen.',
  lesson_series_result:
    "That's the hum of two bulbs in series. Two finger tap again when you're ready to rebuild it in parallel.",
  lesson_parallel_intro:
    'Now rebuild this in parallel. Two finger swipe down on a bulb to remove it, then double tap to choose ' +
    'wire or bulb and swipe to place them, so two bulbs connect between the same two points.',
  lesson_parallel_ready: 'Your parallel circuit is ready. Two finger tap to run it.',
  lesson_compare: 'Listen. In parallel, both bulbs shine at full brightness, and the hum is louder.',
  lesson_complete: 'You finished the guided lesson. Great work.',
} as const

export type ClipName = keyof typeof CLIPS

// A handful of clips need a real Kannada fallback line (not just the English text every other
// clip uses while recordings are pending) — currently just the new run-starting announcement,
// since its exact Kannada wording was specified directly. Left as a small partial override
// rather than translating the whole CLIPS dict, consistent with "English fallback text... until
// recorded audio ships" above.
const CLIPS_KN: Partial<Record<ClipName, string>> = {
  run_starting: 'ಸರಿ, ಸರ್ಕ್ಯೂಟ್ ಚಾಲನೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
  ohms_5: 'ಐದು ಓಮ್', ohms_10: 'ಹತ್ತು ಓಮ್', ohms_20: 'ಇಪ್ಪತ್ತು ಓಮ್', ohms_50: 'ಐವತ್ತು ಓಮ್', ohms_100: 'ನೂರು ಓಮ್',
  volts_1_5: 'ಒಂದೂವರೆ ವೋಲ್ಟ್', volts_3: 'ಮೂರು ವೋಲ್ಟ್', volts_4_5: 'ನಾಲ್ಕೂವರೆ ವೋಲ್ಟ್', volts_6: 'ಆರು ವೋಲ್ಟ್', volts_9: 'ಒಂಬತ್ತು ವೋಲ್ಟ್',
}

export function fallbackFor(name: ClipName, lang: 'en' | 'kn' = 'en'): string {
  if (lang === 'kn') return CLIPS_KN[name] ?? CLIPS[name]
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

// The two-finger-tap value-cycling gesture's fixed value lists — the same preset values Build
// mode offers (src/build/index.tsx's edit dialog), so a circuit built in Sparsh and one built on
// screen can reach the same values.
export const RESISTOR_VALUES: number[] = [5, 10, 20, 50, 100]
export const BATTERY_VALUES: number[] = [1.5, 3, 4.5, 6, 9]

const OHMS_CLIPS: Record<number, ClipName> = { 5: 'ohms_5', 10: 'ohms_10', 20: 'ohms_20', 50: 'ohms_50', 100: 'ohms_100' }
const VOLTS_CLIPS: Record<number, ClipName> = { 1.5: 'volts_1_5', 3: 'volts_3', 4.5: 'volts_4_5', 6: 'volts_6', 9: 'volts_9' }

export function ohmsClipFor(value: number): ClipName {
  return OHMS_CLIPS[value]
}

export function voltsClipFor(value: number): ClipName {
  return VOLTS_CLIPS[value]
}

// Iteration order for the parts summary (TWO_FINGER_HOLD). No longer a menu-cycling order —
// that menu is gone in Phase 4 — just a stable order to report counts in.
export const PART_MENU_ORDER: ComponentType[] = ['battery', 'bulb', 'resistor', 'switch', 'wire']
