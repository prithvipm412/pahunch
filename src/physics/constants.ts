export const DEFAULT_BATTERY_VOLTAGE = 3
export const BATTERY_INTERNAL_RESISTANCE = 0.5
export const DEFAULT_BULB_RESISTANCE = 10
export const DEFAULT_RESISTOR_RESISTANCE = 10

// Voltmeter: an ideal meter modeled as a very high (but finite) resistance, so it reads the
// node-voltage difference across it like any other finite component while drawing negligible
// current. Ammeter has no such constant — it's modeled as a zero-resistance wire (merged into
// the graph exactly like a wire), not a finite resistor; see graph.ts for why.
export const VOLTMETER_RESISTANCE = 1e7

export const DEFAULT_FUSE_RATING = 0.5
export const FUSE_RATING_PRESETS = [0.25, 0.5, 1, 2]

export const SHORT_CIRCUIT_CURRENT_LIMIT = 2

export const BULB_OFF_RATIO = 0.05
export const BULB_DIM_RATIO = 0.5
export const BULB_NORMAL_RATIO = 1.5
export const BULB_BRIGHT_RATIO = 3.0
