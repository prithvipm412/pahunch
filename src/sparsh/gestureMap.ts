import type { ComponentType } from '../contracts/netlist'

// THE single source of truth for every Sparsh gesture. `machine.ts`'s reducer and `index.tsx`'s
// touch handling implement this map; `clips.ts` generates the spoken help text from it
// (buildHelpText below); `index.tsx` also renders it as a plain-text cheat sheet card on the
// Sparsh entry screen, for sighted teachers/judges who aren't using the gestures themselves.
// Keep this the only place that states what a gesture does — if the behavior changes, this file,
// the reducer case it describes, and (for a 1-finger gesture) the touch handler in index.tsx must
// all change together.
export interface GestureMapEntry {
  id: string
  gesture: string
  action: string
}

// The part picker's cycle order for the 1-finger double-tap gesture: first double-tap (from
// idle) always lands on 'wire'; every further double-tap advances one step, wrapping from
// 'fuse' back to 'wire'.
export const PICKER_ORDER: ComponentType[] = [
  'wire',
  'bulb',
  'resistor',
  'switch',
  'battery',
  'ammeter',
  'voltmeter',
  'fuse',
]

export const GESTURE_MAP: GestureMapEntry[] = [
  {
    id: 'tap',
    gesture: 'Tap (1 finger)',
    action:
      'Speak where you are and what is there. On an ammeter or voltmeter, once a run has given it a ' +
      'reading, speaks that reading instead. Never cancels anything.',
  },
  {
    id: 'double_tap',
    gesture: 'Double-tap (1 finger)',
    action:
      'Open or advance the part picker: Wire, Bulb, Resistor, Switch, Battery, Ammeter, Voltmeter, Fuse, ' +
      'then loops back to Wire. Each step speaks the part and gives its vibration. On a placed switch, ' +
      'toggles it open or closed instead.',
  },
  {
    id: 'swipe',
    gesture: 'Swipe (1 finger)',
    action: 'Move one step, or — once a part is chosen — place it in that direction.',
  },
  {
    id: 'long_press',
    gesture: 'Long-press (1 finger, about 600ms)',
    action: 'Cancel the part picker.',
  },
  {
    id: 'two_finger_tap',
    gesture: 'Tap (2 fingers)',
    action:
      'Run the circuit. Right after placing a resistor, battery, or fuse, cycles its value instead and speaks it.',
  },
  {
    id: 'two_finger_hold',
    gesture: 'Hold (2 fingers, about 600ms)',
    action: 'Hear a summary of the whole circuit.',
  },
  {
    id: 'two_finger_swipe_down',
    gesture: 'Swipe down (2 fingers)',
    action: 'Remove the part at the cursor.',
  },
  {
    id: 'two_finger_swipe_up',
    gesture: 'Swipe up (2 fingers)',
    action: 'Toggle a switch at the cursor.',
  },
  {
    id: 'two_finger_swipe_right',
    gesture: 'Swipe right (2 fingers)',
    action: 'Undo the last change.',
  },
  {
    id: 'two_finger_swipe_left',
    gesture: 'Swipe left, twice (2 fingers)',
    action: 'Leave Sparsh mode.',
  },
  {
    id: 'two_finger_double_tap',
    gesture: 'Double-tap (2 fingers)',
    action: 'Restart the guided lesson from the beginning.',
  },
  {
    id: 'three_finger_tap',
    gesture: 'Tap (3 fingers)',
    action: 'Hear this help again, any time.',
  },
]

// Builds the 'help' clip's spoken (English fallback) text directly from GESTURE_MAP, so the
// spoken help and the visible cheat sheet can never drift apart — see clips.ts's `help` entry.
export function buildHelpText(): string {
  return GESTURE_MAP.map((entry) => `${entry.gesture}: ${entry.action}`).join(' ')
}
