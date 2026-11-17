import type { Language } from './lang'

const messages = {
  en: {
    welcome: 'Learn by making', build: 'Build', draw: 'Draw', sparsh: 'Sparsh', learn: 'Learn',
    homeEyebrow: 'CIRCUITS · MADE SIMPLE', homeFooter: 'Explore circuits at your own pace',
    homeModes: 'Learning modes', language: 'Language', backHome: 'Back home',
    circuitLab: 'CIRCUIT LAB', buildTitle: 'Build a circuit', loadedDrawing: 'Loaded from your drawing',
    hintStart: 'Tap a part, then choose two dots in a straight line.', hintChoose: 'Choose the first dot, then a second dot in a straight line.',
    hintTwoDots: 'Choose two different dots.', hintSameLine: 'Choose dots in the same row or column.',
    hintSelectPart: 'Select a part from the tray first.', partAdded: '{part} added.',
    resultsUpdated: 'Circuit results updated.', checkCircuit: 'Check the circuit and try again.',
    circuitCleared: 'Circuit cleared. Select a part from the tray.',
    battery: 'Battery', bulb: 'Bulb', resistor: 'Resistor', switch: 'Switch', wire: 'Wire',
    trayLabel: 'Component tray', gridLabel: 'Five by five circuit grid',
    run: 'Run circuit', predict: 'Predict first', clear: 'Clear', undo: 'Undo last action',
    selectedComponent: 'Selected component', componentValue: 'Component value', delete: 'Delete',
    openSwitch: 'Open switch', closeSwitch: 'Close switch', open: 'Open', closed: 'Closed',
    noBattery: 'No battery yet. Add a battery to power the circuit.',
    shortCircuit: 'Short circuit. Check that a wire does not connect both battery ends directly.',
    openCircuit: 'Open circuit. Close the switch or complete the path back to the battery.',
    otherError: 'The circuit needs another look. Check the connections and try again.',
    fallbackError: 'The circuit needs another look.', warnings: 'Check these connections.',
    voltage: 'Voltage', current: 'Current', power: 'Power', state: 'Bulb state',
    off: 'off', dim: 'dim', normal: 'normal', bright: 'bright', overload: 'overload',
    runResults: 'Circuit results', tapDot: 'Grid dot',
    wireHint: 'Wire tool on: tap two dots or drag between dots. Tap Wire again to turn it off.',
    hintOccupiedWire: 'That line already has a part or wire. Choose another path.',
    bulbResistance: 'Bulb resistance', resistorResistance: 'Resistance',
    decreaseVoltage: 'Decrease voltage', increaseVoltage: 'Increase voltage',
    voltageValue: 'Voltage',
  },
  kn: {
    welcome: 'ಮಾಡುತ್ತಾ ಕಲಿಯಿರಿ', build: 'ಕಟ್ಟಿ', draw: 'ಚಿತ್ರಿಸಿ', sparsh: 'ಸ್ಪರ್ಶ', learn: 'ಕಲಿಯಿರಿ',
    homeEyebrow: 'ವಿದ್ಯುತ್ ವಲಯಗಳು · ಸುಲಭವಾಗಿ', homeFooter: 'ನಿಮ್ಮ ವೇಗದಲ್ಲಿ ವಲಯಗಳನ್ನು ನೋಡಿ',
    homeModes: 'ಕಲಿಕೆಯ ಆಯ್ಕೆಗಳು', language: 'ಭಾಷೆ', backHome: 'ಮನೆಗೆ ಹಿಂದಿರುಗಿ',
    circuitLab: 'ವಿದ್ಯುತ್ ವಲಯ', buildTitle: 'ವಲಯವನ್ನು ಕಟ್ಟಿ', loadedDrawing: 'ನಿಮ್ಮ ಚಿತ್ರದಿಂದ ಬಂದಿದೆ',
    hintStart: 'ಒಂದು ಭಾಗ ಆಯ್ಕೆ ಮಾಡಿ. ನಂತರ ಸರಳ ರೇಖೆಯಲ್ಲಿರುವ ಎರಡು ಚುಕ್ಕೆಗಳನ್ನು ಮುಟ್ಟಿ.',
    hintChoose: 'ಮೊದಲ ಚುಕ್ಕೆಯನ್ನು ಮುಟ್ಟಿ. ನಂತರ ಅದೇ ಸಾಲಿನ ಅಥವಾ ಕಾಲಮ್‌ನ ಇನ್ನೊಂದು ಚುಕ್ಕೆಯನ್ನು ಮುಟ್ಟಿ.',
    hintTwoDots: 'ಬೇರೆ ಬೇರೆ ಎರಡು ಚುಕ್ಕೆಗಳನ್ನು ಆಯ್ಕೆ ಮಾಡಿ.',
    hintSameLine: 'ಒಂದೇ ಸಾಲಿನ ಅಥವಾ ಕಾಲಮ್‌ನ ಚುಕ್ಕೆಗಳನ್ನು ಆಯ್ಕೆ ಮಾಡಿ.',
    hintSelectPart: 'ಮೊದಲು ಕೆಳಗಿನ ಪಟ್ಟಿಯಿಂದ ಒಂದು ಭಾಗ ಆಯ್ಕೆ ಮಾಡಿ.',
    partAdded: '{part} ಸೇರಿಸಲಾಗಿದೆ.', resultsUpdated: 'ವಲಯದ ಫಲಿತಾಂಶ ಬಂದಿದೆ.',
    checkCircuit: 'ವಲಯವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    circuitCleared: 'ವಲಯ ಅಳಿಸಲಾಗಿದೆ. ಕೆಳಗಿನ ಪಟ್ಟಿಯಿಂದ ಒಂದು ಭಾಗ ಆಯ್ಕೆ ಮಾಡಿ.',
    battery: 'ಬ್ಯಾಟರಿ', bulb: 'ಬಲ್ಬ್', resistor: 'ರೆಸಿಸ್ಟರ್', switch: 'ಸ್ವಿಚ್', wire: 'ತಂತಿ',
    trayLabel: 'ವಲಯದ ಭಾಗಗಳು', gridLabel: 'ಐದು ಬೈ ಐದು ವಲಯದ ಜಾಲ',
    run: 'ವಲಯ ಚಾಲನೆ', predict: 'ಮೊದಲು ಊಹಿಸಿ', clear: 'ಅಳಿಸಿ', undo: 'ಕೊನೆಯದನ್ನು ಹಿಂದಕ್ಕೆ',
    selectedComponent: 'ಆಯ್ದ ಭಾಗ', componentValue: 'ಭಾಗದ ಮೌಲ್ಯ', delete: 'ತೆಗೆದುಹಾಕಿ',
    openSwitch: 'ಸ್ವಿಚ್ ತೆರೆಯಿರಿ', closeSwitch: 'ಸ್ವಿಚ್ ಮುಚ್ಚಿ', open: 'ತೆರೆದಿದೆ', closed: 'ಮುಚ್ಚಿದೆ',
    noBattery: 'ಬ್ಯಾಟರಿ ಇಲ್ಲ. ವಲಯಕ್ಕೆ ಶಕ್ತಿ ಕೊಡಲು ಬ್ಯಾಟರಿ ಸೇರಿಸಿ.',
    shortCircuit: 'ಶಾರ್ಟ್ ಸರ್ಕ್ಯೂಟ್. ತಂತಿ ಬ್ಯಾಟರಿಯ ಎರಡೂ ತುದಿಗಳನ್ನು ನೇರವಾಗಿ ಜೋಡಿಸಿಲ್ಲವೇ ನೋಡಿ.',
    openCircuit: 'ವಲಯ ತೆರೆದಿದೆ. ಸ್ವಿಚ್ ಮುಚ್ಚಿ ಅಥವಾ ಬ್ಯಾಟರಿಗೆ ಮರಳುವ ದಾರಿಯನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ.',
    otherError: 'ವಲಯವನ್ನು ಮತ್ತೆ ನೋಡಿ. ಸಂಪರ್ಕಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಪ್ರಯತ್ನಿಸಿ.',
    fallbackError: 'ವಲಯವನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸಿ.', warnings: 'ಈ ಸಂಪರ್ಕಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
    voltage: 'ವೋಲ್ಟೇಜ್', current: 'ವಿದ್ಯುತ್ ಹರಿವು', power: 'ಶಕ್ತಿ', state: 'ಬಲ್ಬ್ ಸ್ಥಿತಿ',
    off: 'ಆರಿದೆ', dim: 'ಮಂದ', normal: 'ಸಾಮಾನ್ಯ', bright: 'ಹೊಳೆಯುತ್ತಿದೆ', overload: 'ಹೆಚ್ಚು ಬಿಸಿ',
    runResults: 'ವಲಯದ ಫಲಿತಾಂಶ', tapDot: 'ಜಾಲದ ಚುಕ್ಕೆ',
    wireHint: 'ತಂತಿ ಆಯ್ಕೆ: ಎರಡು ಚುಕ್ಕೆಗಳನ್ನು ಮುಟ್ಟಿ ಅಥವಾ ಎಳೆಯಿರಿ. ತಂತಿಯನ್ನು ಮತ್ತೆ ಮುಟ್ಟಿ ನಿಲ್ಲಿಸಿ.',
    hintOccupiedWire: 'ಆ ದಾರಿಯಲ್ಲಿ ಈಗಾಗಲೇ ಭಾಗ ಅಥವಾ ತಂತಿ ಇದೆ. ಬೇರೆ ದಾರಿ ಆಯ್ಕೆ ಮಾಡಿ.',
    bulbResistance: 'ಬಲ್ಬ್‌ನ ರೆಸಿಸ್ಟೆನ್ಸ್', resistorResistance: 'ರೆಸಿಸ್ಟೆನ್ಸ್',
    decreaseVoltage: 'ವೋಲ್ಟೇಜ್ ಕಡಿಮೆ ಮಾಡಿ', increaseVoltage: 'ವೋಲ್ಟೇಜ್ ಹೆಚ್ಚಿಸಿ',
    voltageValue: 'ವೋಲ್ಟೇಜ್',
  },
} as const

export type TranslationKey = keyof typeof messages.en

/** Returns a short interface label in the selected language. */
export function t(key: TranslationKey, language: Language = 'en'): string {
  return messages[language][key] ?? messages.en[key]
}

/** Replaces the named interpolation fields in a translated label. */
export function tWith(key: TranslationKey, language: Language, values: Record<string, string>): string {
  return Object.entries(values).reduce((message, [name, value]) => message.replaceAll(`{${name}}`, value), t(key, language))
}
