/**
 * content/puzzles/predict.ts — the 10 "Predict" questions.
 *
 * Each question shows a real 5x5-grid circuit, asks the student to predict what the
 * bulbs will do, then runs solve() to reveal the answer. `correctKey` is authored by
 * hand but every single one is cross-checked against solve() in puzzles.test.ts — if
 * the solver ever disagreed with the intended answer, the netlist would be adjusted
 * until it matched (see that test file for exactly which states were verified).
 */
import type { PredictQuestion } from './types'

export const PREDICT_QUESTIONS: PredictQuestion[] = [
  {
    id: 'p1',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: true },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Battery, a closed switch, and one bulb. Will the bulb glow?',
      kn: 'ಬ್ಯಾಟರಿ, ಮುಚ್ಚಿದ ಸ್ವಿಚ್, ಮತ್ತು ಒಂದು ಬಲ್ಬ್. ಬಲ್ಬ್ ಹೊಳೆಯುತ್ತದೆಯೇ?',
    },
    options: [
      { key: 'yes', text: { en: 'Yes', kn: 'ಹೌದು' } },
      { key: 'no', text: { en: 'No', kn: 'ಇಲ್ಲ' } },
    ],
    correctKey: 'yes',
    why: {
      en: 'The switch is closed, so the path is complete all the way around — current can flow.',
      kn: 'ಸ್ವಿಚ್ ಮುಚ್ಚಿದೆ, ಹಾಗಾಗಿ ಸಂಪೂರ್ಣ ಮಾರ್ಗ ಪೂರ್ಣವಾಗಿದೆ — ವಿದ್ಯುತ್ ಹರಿಯಬಹುದು.',
    },
    skill: 'complete_loop',
  },
  {
    id: 'p2',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Same circuit, but the switch is OPEN. Will the bulb glow?',
      kn: 'ಅದೇ ಸರ್ಕ್ಯೂಟ್, ಆದರೆ ಸ್ವಿಚ್ ತೆರೆದಿದೆ. ಬಲ್ಬ್ ಹೊಳೆಯುತ್ತದೆಯೇ?',
    },
    options: [
      { key: 'yes', text: { en: 'Yes', kn: 'ಹೌದು' } },
      { key: 'no', text: { en: 'No', kn: 'ಇಲ್ಲ' } },
    ],
    correctKey: 'no',
    why: {
      en: "The path is broken at the open switch, so current can't flow.",
      kn: 'ತೆರೆದ ಸ್ವಿಚ್‌ನಲ್ಲಿ ಮಾರ್ಗ ಮುರಿದಿದೆ, ಹಾಗಾಗಿ ವಿದ್ಯುತ್ ಹರಿಯಲು ಸಾಧ್ಯವಿಲ್ಲ.',
    },
    skill: 'complete_loop',
  },
  {
    id: 'p3',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Two bulbs in SERIES, compared to one bulb alone. Each bulb will be…',
      kn: 'ಸರಣಿಯಲ್ಲಿ ಎರಡು ಬಲ್ಬ್‌ಗಳು, ಒಂದೇ ಬಲ್ಬ್‌ಗೆ ಹೋಲಿಸಿದರೆ. ಪ್ರತಿ ಬಲ್ಬ್ ಹೀಗಿರುತ್ತದೆ…',
    },
    options: [
      { key: 'brighter', text: { en: 'Brighter', kn: 'ಪ್ರಕಾಶಮಾನ' } },
      { key: 'same', text: { en: 'Same', kn: 'ಅದೇ' } },
      { key: 'dimmer', text: { en: 'Dimmer', kn: 'ಮಂದ' } },
    ],
    correctKey: 'dimmer',
    why: {
      en: "In series, both bulbs share the battery's push, so each one glows dimmer.",
      kn: 'ಸರಣಿಯಲ್ಲಿ, ಎರಡೂ ಬಲ್ಬ್‌ಗಳು ಬ್ಯಾಟರಿಯ ಶಕ್ತಿಯನ್ನು ಹಂಚಿಕೊಳ್ಳುತ್ತವೆ, ಹಾಗಾಗಿ ಪ್ರತಿಯೊಂದೂ ಮಂದವಾಗಿ ಹೊಳೆಯುತ್ತದೆ.',
    },
    skill: 'sharing',
  },
  {
    id: 'p4',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Two bulbs in PARALLEL. Each bulb, compared to one bulb alone…',
      kn: 'ಸಮಾಂತರದಲ್ಲಿ ಎರಡು ಬಲ್ಬ್‌ಗಳು. ಒಂದೇ ಬಲ್ಬ್‌ಗೆ ಹೋಲಿಸಿದರೆ ಪ್ರತಿ ಬಲ್ಬ್…',
    },
    options: [
      { key: 'much_brighter', text: { en: 'Much brighter', kn: 'ಹೆಚ್ಚು ಪ್ರಕಾಶಮಾನ' } },
      { key: 'about_same', text: { en: 'About the same', kn: 'ಸುಮಾರು ಅದೇ' } },
      { key: 'much_dimmer', text: { en: 'Much dimmer', kn: 'ಹೆಚ್ಚು ಮಂದ' } },
    ],
    correctKey: 'about_same',
    why: {
      en: 'In parallel, each bulb has its own path straight to the battery, so each gets about the same push as if it were alone.',
      kn: 'ಸಮಾಂತರದಲ್ಲಿ, ಪ್ರತಿ ಬಲ್ಬ್‌ಗೂ ಬ್ಯಾಟರಿಗೆ ತನ್ನದೇ ಆದ ಮಾರ್ಗ ಇರುತ್ತದೆ, ಹಾಗಾಗಿ ಅದು ಒಂಟಿಯಾಗಿದ್ದಂತೆ ಹೊಳೆಯುತ್ತದೆ.',
    },
    skill: 'separate_paths',
  },
  {
    id: 'p5',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Two bulbs were in series. One bulb is removed, leaving a gap. The other bulb will…',
      kn: 'ಎರಡು ಬಲ್ಬ್‌ಗಳು ಸರಣಿಯಲ್ಲಿದ್ದವು. ಒಂದು ಬಲ್ಬ್ ತೆಗೆಯಲಾಗಿದೆ, ಒಂದು ಅಂತರ ಉಳಿದಿದೆ. ಇನ್ನೊಂದು ಬಲ್ಬ್…',
    },
    options: [
      { key: 'stay_on', text: { en: 'Stay on', kn: 'ಹೊಳೆಯುತ್ತಲೇ ಇರುತ್ತದೆ' } },
      { key: 'go_off', text: { en: 'Go off', kn: 'ಆರಿಕೊಳ್ಳುತ್ತದೆ' } },
    ],
    correctKey: 'go_off',
    why: {
      en: 'They shared one single path. The gap breaks that one path, so no current can reach either bulb.',
      kn: 'ಅವು ಒಂದೇ ಮಾರ್ಗವನ್ನು ಹಂಚಿಕೊಂಡಿದ್ದವು. ಅಂತರ ಆ ಒಂದು ಮಾರ್ಗವನ್ನು ಮುರಿಯುತ್ತದೆ, ಹಾಗಾಗಿ ಯಾವುದೇ ಬಲ್ಬ್‌ಗೆ ವಿದ್ಯುತ್ ತಲುಪುವುದಿಲ್ಲ.',
    },
    skill: 'one_path',
  },
  {
    id: 'p6',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Two bulbs were in parallel. One bulb is removed. The other bulb will…',
      kn: 'ಎರಡು ಬಲ್ಬ್‌ಗಳು ಸಮಾಂತರದಲ್ಲಿದ್ದವು. ಒಂದು ಬಲ್ಬ್ ತೆಗೆಯಲಾಗಿದೆ. ಇನ್ನೊಂದು ಬಲ್ಬ್…',
    },
    options: [
      { key: 'stay_on', text: { en: 'Stay on', kn: 'ಹೊಳೆಯುತ್ತಲೇ ಇರುತ್ತದೆ' } },
      { key: 'go_off', text: { en: 'Go off', kn: 'ಆರಿಕೊಳ್ಳುತ್ತದೆ' } },
    ],
    correctKey: 'stay_on',
    why: {
      en: 'Its own path to the battery is still complete, so it keeps glowing on its own.',
      kn: 'ಬ್ಯಾಟರಿಗೆ ಅದರದ್ದೇ ಮಾರ್ಗ ಇನ್ನೂ ಪೂರ್ಣವಾಗಿದೆ, ಹಾಗಾಗಿ ಅದು ಹೊಳೆಯುತ್ತಲೇ ಇರುತ್ತದೆ.',
    },
    skill: 'separate_paths',
  },
  {
    id: 'p7',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 2 }, to: { row: 0, col: 3 }, value: 10 },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'A bulb plus a 10Ω resistor, compared to the bulb alone. The bulb will be…',
      kn: 'ಬಲ್ಬ್ ಮತ್ತು 10Ω ರೆಸಿಸ್ಟರ್, ಒಂಟಿ ಬಲ್ಬ್‌ಗೆ ಹೋಲಿಸಿದರೆ. ಬಲ್ಬ್ ಹೀಗಿರುತ್ತದೆ…',
    },
    options: [
      { key: 'brighter', text: { en: 'Brighter', kn: 'ಪ್ರಕಾಶಮಾನ' } },
      { key: 'same', text: { en: 'Same', kn: 'ಅದೇ' } },
      { key: 'dimmer', text: { en: 'Dimmer', kn: 'ಮಂದ' } },
    ],
    correctKey: 'dimmer',
    why: {
      en: 'The resistor slows the current down, so less current reaches the bulb.',
      kn: 'ರೆಸಿಸ್ಟರ್ ವಿದ್ಯುತ್ ಅನ್ನು ನಿಧಾನಗೊಳಿಸುತ್ತದೆ, ಹಾಗಾಗಿ ಬಲ್ಬ್‌ಗೆ ಕಡಿಮೆ ವಿದ್ಯುತ್ ತಲುಪುತ್ತದೆ.',
    },
    skill: 'resistance',
  },
  {
    id: 'p8',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 2 }, to: { row: 0, col: 3 }, value: 100 },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'Now the resistor is 100Ω instead of 10Ω. The bulb will be…',
      kn: 'ಈಗ ರೆಸಿಸ್ಟರ್ 10Ω ಬದಲು 100Ω ಆಗಿದೆ. ಬಲ್ಬ್ ಹೀಗಿರುತ್ತದೆ…',
    },
    options: [
      { key: 'bright', text: { en: 'Bright', kn: 'ಪ್ರಕಾಶಮಾನ' } },
      { key: 'very_dim_or_off', text: { en: 'Very dim or off', kn: 'ಬಹಳ ಮಂದ ಅಥವಾ ಆರಿಹೋಗಿದೆ' } },
      { key: 'exploding', text: { en: 'Exploding', kn: 'ಸಿಡಿಯುತ್ತಿದೆ' } },
    ],
    correctKey: 'very_dim_or_off',
    why: {
      en: 'A big resistor blocks almost all the current, so barely any reaches the bulb.',
      kn: 'ದೊಡ್ಡ ರೆಸಿಸ್ಟರ್ ಬಹುತೇಕ ಎಲ್ಲಾ ವಿದ್ಯುತ್ ಅನ್ನು ತಡೆಯುತ್ತದೆ, ಹಾಗಾಗಿ ಬಲ್ಬ್‌ಗೆ ಬಹುತೇಕ ಏನೂ ತಲುಪುವುದಿಲ್ಲ.',
    },
    skill: 'resistance',
  },
  {
    id: 'p9',
    netlist: {
      gridSize: 5,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 9 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    },
    question: {
      en: 'The battery changes from 3V to 9V, same single bulb. The bulb will be…',
      kn: 'ಬ್ಯಾಟರಿ 3V ನಿಂದ 9V ಗೆ ಬದಲಾಗುತ್ತದೆ, ಅದೇ ಒಂದು ಬಲ್ಬ್. ಬಲ್ಬ್ ಹೀಗಿರುತ್ತದೆ…',
    },
    options: [
      { key: 'dimmer', text: { en: 'Dimmer', kn: 'ಮಂದ' } },
      { key: 'same', text: { en: 'Same', kn: 'ಅದೇ' } },
      { key: 'brighter_overload', text: { en: 'Brighter (may overload)', kn: 'ಹೆಚ್ಚು ಪ್ರಕಾಶಮಾನ (ಓವರ್‌ಲೋಡ್ ಆಗಬಹುದು)' } },
    ],
    correctKey: 'brighter_overload',
    why: {
      en: 'More voltage pushes more current through the bulb — much brighter, maybe dangerously so.',
      kn: 'ಹೆಚ್ಚು ವೋಲ್ಟೇಜ್ ಬಲ್ಬ್ ಮೂಲಕ ಹೆಚ್ಚು ವಿದ್ಯುತ್ ಅನ್ನು ತಳ್ಳುತ್ತದೆ — ಹೆಚ್ಚು ಪ್ರಕಾಶಮಾನ, ಬಹುಶಃ ಅಪಾಯಕಾರಿಯಾಗಿ.',
    },
    skill: 'voltage',
  },
  {
    id: 'p10',
    netlist: {
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
    question: {
      en: 'Two bulbs in series, then a wire is placed directly across Bulb A. What happens?',
      kn: 'ಸರಣಿಯಲ್ಲಿ ಎರಡು ಬಲ್ಬ್‌ಗಳು, ನಂತರ ಬಲ್ಬ್ A ಅಡ್ಡಲಾಗಿ ಒಂದು ತಂತಿ ಹಾಕಲಾಗಿದೆ. ಏನಾಗುತ್ತದೆ?',
    },
    options: [
      { key: 'both_glow', text: { en: 'Both glow', kn: 'ಎರಡೂ ಹೊಳೆಯುತ್ತವೆ' } },
      { key: 'a_off_b_brighter', text: { en: 'A off, B brighter', kn: 'A ಆರಿಹೋಗುತ್ತದೆ, B ಪ್ರಕಾಶಮಾನ' } },
      { key: 'both_off', text: { en: 'Both off', kn: 'ಎರಡೂ ಆರಿಹೋಗುತ್ತವೆ' } },
    ],
    correctKey: 'a_off_b_brighter',
    why: {
      en: 'Current takes the easy shortcut around Bulb A, so A goes dark while B now gets more of the push.',
      kn: 'ವಿದ್ಯುತ್ ಬಲ್ಬ್ A ಸುತ್ತ ಸುಲಭ ಮಾರ್ಗವನ್ನು ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ, ಹಾಗಾಗಿ A ಆರಿಹೋಗುತ್ತದೆ ಮತ್ತು B ಹೆಚ್ಚು ಪ್ರಕಾಶಮಾನವಾಗಿ ಹೊಳೆಯುತ್ತದೆ.',
    },
    skill: 'shortcut_path',
  },
]
