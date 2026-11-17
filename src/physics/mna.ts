import { lusolve } from 'mathjs'
import type { CircuitComponent } from '../contracts/netlist'
import {
  BATTERY_INTERNAL_RESISTANCE,
  DEFAULT_BATTERY_VOLTAGE,
  DEFAULT_BULB_RESISTANCE,
  DEFAULT_RESISTOR_RESISTANCE,
  VOLTMETER_RESISTANCE,
} from './constants'
import type { CircuitGraph } from './graph'
import { nodeIndexOf } from './graph'

// Only called for graph.finiteComponents — bulb/resistor/battery/voltmeter. Ammeter and intact
// fuse are merged into the graph like a wire (see graph.ts), so they never reach here; a blown
// fuse and an open switch are excluded from finiteComponents entirely.
export function resistanceOf(c: CircuitComponent): number {
  if (c.type === 'bulb') return c.value ?? DEFAULT_BULB_RESISTANCE
  if (c.type === 'resistor') return c.value ?? DEFAULT_RESISTOR_RESISTANCE
  if (c.type === 'voltmeter') return VOLTMETER_RESISTANCE
  throw new Error(`resistanceOf: unsupported component type ${c.type}`)
}

export function batteryVoltageOf(c: CircuitComponent): number {
  return c.value ?? DEFAULT_BATTERY_VOLTAGE
}

// Solves for node voltages using Modified Nodal Analysis. Batteries are
// stamped as their Norton equivalent (a conductance in parallel with a
// current source), so no extra branch-current unknowns are needed. One node
// per electrical island is grounded to keep the matrix non-singular. Returns
// null (never throws) if the solve fails.
export function solveVoltages(graph: CircuitGraph): number[] | null {
  const n = graph.nodeCount
  if (n === 0) return []

  const G: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const J: number[] = new Array(n).fill(0)

  const stamp = (n1: number, n2: number, g: number) => {
    G[n1][n1] += g
    G[n2][n2] += g
    G[n1][n2] -= g
    G[n2][n1] -= g
  }

  for (const c of graph.finiteComponents) {
    const n1 = nodeIndexOf(graph, c.from)
    const n2 = nodeIndexOf(graph, c.to)
    if (c.type === 'battery') {
      const g = 1 / BATTERY_INTERNAL_RESISTANCE
      const vs = batteryVoltageOf(c)
      stamp(n1, n2, g)
      J[n1] += vs * g
      J[n2] -= vs * g
    } else {
      const r = resistanceOf(c)
      const g = r === 0 ? 1e9 : 1 / r
      stamp(n1, n2, g)
    }
  }

  for (const groundNode of graph.groundNodeByIsland.values()) {
    for (let col = 0; col < n; col++) G[groundNode][col] = 0
    G[groundNode][groundNode] = 1
    J[groundNode] = 0
  }

  try {
    const result = lusolve(G, J) as number[][]
    return result.map((row) => row[0])
  } catch {
    return null
  }
}
