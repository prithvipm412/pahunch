/**
 * content/puzzles/faults.ts — the 10 "Fault Hunt" puzzles.
 *
 * Each puzzle shows a circuit that SHOULD light but doesn't. The student taps the one
 * faulty part; tapping `faultyId` swaps in `fixedNetlist`. Every broken/fixed pair is
 * cross-checked against solve() in puzzles.test.ts.
 */
import type { FaultQuestion } from './types'

export const FAULT_QUESTIONS: FaultQuestion[] = [
  {
    id: 'f1',
    prompt: {
      en: 'Nothing lights up. Trace the loop and tap the broken part.',
      kn: 'ಏನೂ ಹೊಳೆಯುತ್ತಿಲ್ಲ. ಮಾರ್ಗವನ್ನು ಪತ್ತೆಹಚ್ಚಿ ಮುರಿದ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: does the wire at the end actually lead back to the battery?',
      kn: 'ಸುಳಿವು: ಕೊನೆಯ ತಂತಿ ನಿಜವಾಗಿಯೂ ಬ್ಯಾಟರಿಗೆ ಹಿಂತಿರುಗುತ್ತದೆಯೇ?',
    },
    why: {
      en: 'That wire did not lead back to the battery — the loop was never complete.',
      kn: 'ಆ ತಂತಿ ಬ್ಯಾಟರಿಗೆ ಹಿಂತಿರುಗಿರಲಿಲ್ಲ — ಮಾರ್ಗ ಎಂದಿಗೂ ಪೂರ್ಣವಾಗಿರಲಿಲ್ಲ.',
    },
    skill: 'trace_loop',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
      ],
    },
    faultyId: 'wire1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f2',
    prompt: {
      en: 'Nothing lights up. Find out why and tap the broken part.',
      kn: 'ಏನೂ ಹೊಳೆಯುತ್ತಿಲ್ಲ. ಕಾರಣ ಕಂಡುಹಿಡಿದು ಮುರಿದ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: check the switch — is it open or closed?',
      kn: 'ಸುಳಿವು: ಸ್ವಿಚ್ ಪರಿಶೀಲಿಸಿ — ಅದು ತೆರೆದಿದೆಯೇ ಅಥವಾ ಮುಚ್ಚಿದೆಯೇ?',
    },
    why: {
      en: 'The switch was left open, breaking the loop.',
      kn: 'ಸ್ವಿಚ್ ತೆರೆದೇ ಇತ್ತು, ಮಾರ್ಗವನ್ನು ಮುರಿಯಿತು.',
    },
    skill: 'trace_loop',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'switch1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: true },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f3',
    prompt: {
      en: 'Battery in danger! There is a short circuit. Tap the wire causing it.',
      kn: 'ಬ್ಯಾಟರಿ ಅಪಾಯದಲ್ಲಿದೆ! ಷಾರ್ಟ್ ಸರ್ಕ್ಯೂಟ್ ಇದೆ. ಅದಕ್ಕೆ ಕಾರಣವಾದ ತಂತಿ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: look for a wire that connects directly across the battery.',
      kn: 'ಸುಳಿವು: ಬ್ಯಾಟರಿ ಅಡ್ಡಲಾಗಿ ನೇರವಾಗಿ ಸಂಪರ್ಕಿಸುವ ತಂತಿಯನ್ನು ನೋಡಿ.',
    },
    why: {
      en: 'A wire directly across the battery is a short circuit — dangerous, and it skips the bulb entirely.',
      kn: 'ಬ್ಯಾಟರಿ ಅಡ್ಡಲಾಗಿ ನೇರ ತಂತಿ ಷಾರ್ಟ್ ಸರ್ಕ್ಯೂಟ್ — ಅಪಾಯಕಾರಿ, ಮತ್ತು ಬಲ್ಬ್ ಅನ್ನು ಸಂಪೂರ್ಣವಾಗಿ ಬಿಟ್ಟುಬಿಡುತ್ತದೆ.',
    },
    skill: 'spot_shortcut',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
        { id: 'wire2', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'wire2',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f4',
    prompt: {
      en: 'Two bulbs should glow, but one is dark. Tap the part causing the shortcut.',
      kn: 'ಎರಡು ಬಲ್ಬ್‌ಗಳು ಹೊಳೆಯಬೇಕು, ಆದರೆ ಒಂದು ಕತ್ತಲಾಗಿದೆ. ಅಡ್ಡ ಮಾರ್ಗಕ್ಕೆ ಕಾರಣವಾದ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: look for a wire running alongside one of the bulbs.',
      kn: 'ಸುಳಿವು: ಒಂದು ಬಲ್ಬ್‌ನ ಪಕ್ಕದಲ್ಲಿ ಓಡುವ ತಂತಿಯನ್ನು ನೋಡಿ.',
    },
    why: {
      en: 'That wire bypassed Bulb A completely, so current skipped it instead of flowing through.',
      kn: 'ಆ ತಂತಿ ಬಲ್ಬ್ A ಅನ್ನು ಸಂಪೂರ್ಣವಾಗಿ ಬಿಟ್ಟುಬಿಟ್ಟಿತು, ಹಾಗಾಗಿ ವಿದ್ಯುತ್ ಅದರ ಮೂಲಕ ಹರಿಯುವ ಬದಲು ಅದನ್ನು ಬಿಟ್ಟುಬಿಟ್ಟಿತು.',
    },
    skill: 'spot_shortcut',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulbA', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulbB', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
        { id: 'bypassWire', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
      ],
    },
    faultyId: 'bypassWire',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulbA', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulbB', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f5',
    prompt: {
      en: 'The bulb barely glows. Tap the part that is blocking the current.',
      kn: 'ಬಲ್ಬ್ ಬಹುತೇಕ ಹೊಳೆಯುತ್ತಿಲ್ಲ. ವಿದ್ಯುತ್ ಅನ್ನು ತಡೆಯುತ್ತಿರುವ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: a very large resistor blocks almost all the current.',
      kn: 'ಸುಳಿವು: ಬಹಳ ದೊಡ್ಡ ರೆಸಿಸ್ಟರ್ ಬಹುತೇಕ ಎಲ್ಲಾ ವಿದ್ಯುತ್ ಅನ್ನು ತಡೆಯುತ್ತದೆ.',
    },
    why: {
      en: 'The 100Ω resistor was blocking almost all the current — a smaller resistor lets the bulb glow.',
      kn: '100Ω ರೆಸಿಸ್ಟರ್ ಬಹುತೇಕ ಎಲ್ಲಾ ವಿದ್ಯುತ್ ಅನ್ನು ತಡೆಯುತ್ತಿತ್ತು — ಚಿಕ್ಕ ರೆಸಿಸ್ಟರ್ ಬಲ್ಬ್ ಹೊಳೆಯಲು ಅನುಮತಿಸುತ್ತದೆ.',
    },
    skill: 'resistance',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, value: 100 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'resistor1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, value: 10 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f6',
    prompt: {
      en: 'Two bulbs in series, both dark. One bulb is dead. Tap it.',
      kn: 'ಸರಣಿಯಲ್ಲಿ ಎರಡು ಬಲ್ಬ್‌ಗಳು, ಎರಡೂ ಕತ್ತಲಾಗಿವೆ. ಒಂದು ಬಲ್ಬ್ ಸತ್ತಿದೆ. ಅದನ್ನು ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: they share one path — which bulb is not actually connected through?',
      kn: 'ಸುಳಿವು: ಅವು ಒಂದೇ ಮಾರ್ಗವನ್ನು ಹಂಚಿಕೊಳ್ಳುತ್ತವೆ — ಯಾವ ಬಲ್ಬ್ ನಿಜವಾಗಿ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ?',
    },
    why: {
      en: 'The dead bulb broke the one shared path, so neither bulb could glow.',
      kn: 'ಸತ್ತ ಬಲ್ಬ್ ಒಂದೇ ಹಂಚಿಕೆಯ ಮಾರ್ಗವನ್ನು ಮುರಿಯಿತು, ಹಾಗಾಗಿ ಯಾವುದೇ ಬಲ್ಬ್ ಹೊಳೆಯಲಿಲ್ಲ.',
    },
    skill: 'one_path',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 1, col: 2 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'bulb2',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f7',
    prompt: {
      en: 'Two bulbs in parallel, one is dark. Tap the broken part on its branch.',
      kn: 'ಸಮಾಂತರದಲ್ಲಿ ಎರಡು ಬಲ್ಬ್‌ಗಳು, ಒಂದು ಕತ್ತಲಾಗಿದೆ. ಅದರ ಕವಲಿನಲ್ಲಿ ಮುರಿದ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: "Hint: each branch has its own switch — check the dark bulb's branch.",
      kn: 'ಸುಳಿವು: ಪ್ರತಿ ಕವಲಿಗೂ ತನ್ನದೇ ಸ್ವಿಚ್ ಇದೆ — ಕತ್ತಲಾದ ಬಲ್ಬ್‌ನ ಕವಲನ್ನು ಪರಿಶೀಲಿಸಿ.',
    },
    why: {
      en: "That branch's switch was open, so only that one path was broken — the other bulb kept glowing fine.",
      kn: 'ಆ ಕವಲಿನ ಸ್ವಿಚ್ ತೆರೆದಿತ್ತು, ಹಾಗಾಗಿ ಆ ಒಂದು ಮಾರ್ಗ ಮಾತ್ರ ಮುರಿದಿತ್ತು — ಇನ್ನೊಂದು ಬಲ್ಬ್ ಚೆನ್ನಾಗಿ ಹೊಳೆಯುತ್ತಲೇ ಇತ್ತು.',
    },
    skill: 'separate_paths',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 3 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'switch1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 3 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: true },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f8',
    prompt: {
      en: 'Two batteries, but nothing glows. Tap the one facing the wrong way.',
      kn: 'ಎರಡು ಬ್ಯಾಟರಿಗಳು, ಆದರೆ ಏನೂ ಹೊಳೆಯುತ್ತಿಲ್ಲ. ತಪ್ಪು ದಿಕ್ಕಿನಲ್ಲಿರುವುದನ್ನು ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: if both batteries push against each other, they cancel out.',
      kn: 'ಸುಳಿವು: ಎರಡು ಬ್ಯಾಟರಿಗಳು ಒಂದಕ್ಕೊಂದು ವಿರುದ್ಧವಾಗಿ ತಳ್ಳಿದರೆ, ಅವು ರದ್ದಾಗುತ್ತವೆ.',
    },
    why: {
      en: 'The two batteries were facing opposite ways and cancelled each other out. Facing the same way, they add up.',
      kn: 'ಎರಡು ಬ್ಯಾಟರಿಗಳು ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿದ್ದವು ಮತ್ತು ಒಂದನ್ನೊಂದು ರದ್ದುಗೊಳಿಸಿದವು. ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿದ್ದರೆ, ಅವು ಸೇರುತ್ತವೆ.',
    },
    skill: 'direction_matters',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'battery2', type: 'battery', from: { row: 0, col: 2 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'battery2',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'battery2', type: 'battery', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wireReturn', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f9',
    prompt: {
      en: 'The bulb is dark. One wire leads to a dead end. Tap it.',
      kn: 'ಬಲ್ಬ್ ಕತ್ತಲಾಗಿದೆ. ಒಂದು ತಂತಿ ಎಲ್ಲಿಗೂ ಹೋಗುವುದಿಲ್ಲ. ಅದನ್ನು ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: the bulb is only connected on one side — follow the loose wire.',
      kn: 'ಸುಳಿವು: ಬಲ್ಬ್ ಒಂದೇ ಬದಿಯಲ್ಲಿ ಸಂಪರ್ಕಗೊಂಡಿದೆ — ಸಡಿಲ ತಂತಿಯನ್ನು ಅನುಸರಿಸಿ.',
    },
    why: {
      en: 'That wire went nowhere, so the loop was never complete and no current could flow.',
      kn: 'ಆ ತಂತಿ ಎಲ್ಲಿಗೂ ಹೋಗಲಿಲ್ಲ, ಹಾಗಾಗಿ ಮಾರ್ಗ ಎಂದಿಗೂ ಪೂರ್ಣವಾಗಿರಲಿಲ್ಲ ಮತ್ತು ವಿದ್ಯುತ್ ಹರಿಯಲಿಲ್ಲ.',
    },
    skill: 'complete_loop',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 3, col: 2 } },
      ],
    },
    faultyId: 'wire1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
  },
  {
    id: 'f10',
    prompt: {
      en: 'The bulb glows red and looks dangerous. Tap the part causing it.',
      kn: 'ಬಲ್ಬ್ ಕೆಂಪು ಬಣ್ಣದಲ್ಲಿ ಹೊಳೆಯುತ್ತಿದೆ ಮತ್ತು ಅಪಾಯಕಾರಿಯಾಗಿ ಕಾಣುತ್ತದೆ. ಅದಕ್ಕೆ ಕಾರಣವಾದ ಭಾಗ ತಟ್ಟಿ.',
    },
    hint: {
      en: 'Hint: check the battery voltage — is it too high for this bulb?',
      kn: 'ಸುಳಿವು: ಬ್ಯಾಟರಿ ವೋಲ್ಟೇಜ್ ಪರಿಶೀಲಿಸಿ — ಇದು ಈ ಬಲ್ಬ್‌ಗೆ ಹೆಚ್ಚಾಗಿದೆಯೇ?',
    },
    why: {
      en: 'The 9V battery pushed too much current through the bulb. A 3V battery is safe for it.',
      kn: '9V ಬ್ಯಾಟರಿ ಬಲ್ಬ್ ಮೂಲಕ ಹೆಚ್ಚು ವಿದ್ಯುತ್ ಅನ್ನು ತಳ್ಳಿತು. 3V ಬ್ಯಾಟರಿ ಇದಕ್ಕೆ ಸುರಕ್ಷಿತ.',
    },
    skill: 'safe_voltage',
    brokenNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 9 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
    faultyId: 'battery1',
    fixedNetlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 3 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
  },
]
