export type ComponentType =
  | 'battery'
  | 'bulb'
  | 'resistor'
  | 'switch'
  | 'wire'
  | 'ammeter'
  | 'voltmeter'
  | 'fuse'

// row/col are 0-based: valid values are 0 to gridSize-1 (inclusive).
export interface GridPoint {
  row: number
  col: number
}

export interface CircuitComponent {
  id: string
  type: ComponentType
  from: GridPoint
  to: GridPoint
  // Resistor ohms, battery volts, or (fuse only) its rating in amperes — presets 0.25/0.5/1/2,
  // default 0.5 (src/physics/constants.ts's DEFAULT_FUSE_RATING/FUSE_RATING_PRESETS). Ammeter and
  // voltmeter ignore `value`: they're ideal meters with a fixed resistance (see src/physics).
  value?: number
  closed?: boolean
}

export interface Netlist {
  gridSize: number
  components: CircuitComponent[]
  source: 'build' | 'draw' | 'sparsh'
}

export interface ComponentResult {
  id: string
  // An ammeter's reading is |current|; a voltmeter's reading is |voltage|.
  voltage: number
  current: number
  power: number
  // 'blown' is a fuse whose rated current (its `value`) was exceeded during solve() — it's now
  // treated as open (see src/physics), same as an open switch but permanent for this netlist.
  state: 'off' | 'dim' | 'normal' | 'bright' | 'overload' | 'blown'
}

export interface SolveResult {
  ok: boolean
  components: ComponentResult[]
  warnings: string[]
  errors: string[]
}
