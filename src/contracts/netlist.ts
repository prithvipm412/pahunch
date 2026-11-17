export type ComponentType = 'battery' | 'bulb' | 'resistor' | 'switch' | 'wire'

export interface GridPoint {
  row: number
  col: number
}

export interface CircuitComponent {
  id: string
  type: ComponentType
  from: GridPoint
  to: GridPoint
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
  voltage: number
  current: number
  power: number
  state: 'off' | 'dim' | 'normal' | 'bright' | 'overload'
}

export interface SolveResult {
  ok: boolean
  components: ComponentResult[]
  warnings: string[]
  errors: string[]
}
