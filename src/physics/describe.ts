import type { ComponentType, Netlist } from '../contracts/netlist'
import { buildGraph, nodeIndexOf } from './graph'
import { validate } from './validate'

export type Topology = 'series' | 'parallel' | 'mixed' | 'incomplete' | 'empty'

export interface CircuitDescription {
  counts: Record<ComponentType, number>
  topology: Topology
}

const COMPONENT_TYPES: ComponentType[] = [
  'battery',
  'bulb',
  'resistor',
  'switch',
  'wire',
  'ammeter',
  'voltmeter',
  'fuse',
]

function emptyCounts(): Record<ComponentType, number> {
  const counts = {} as Record<ComponentType, number>
  for (const type of COMPONENT_TYPES) counts[type] = 0
  return counts
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

// Describes a netlist's shape for Sparsh's spoken summary: how many of each part, and whether
// the loads (everything but the battery) form a series chain, a parallel group, a mix of both,
// or the circuit is not yet a closed loop. Purely structural — it does not call solve().
export function describeCircuit(netlist: Netlist): CircuitDescription {
  const counts = emptyCounts()
  for (const c of netlist.components) counts[c.type]++

  if (netlist.components.length === 0) {
    return { counts, topology: 'empty' }
  }

  const { errors } = validate(netlist)
  if (errors.includes('no_battery') || errors.includes('open_circuit')) {
    return { counts, topology: 'incomplete' }
  }

  const graph = buildGraph(netlist)
  const loads = graph.finiteComponents.filter((c) => c.type !== 'battery')

  if (loads.length === 0) {
    return { counts, topology: 'incomplete' }
  }
  if (loads.length === 1) {
    return { counts, topology: 'series' }
  }

  const pairCounts = new Map<string, number>()
  const degreeByNode = new Map<number, number>()
  for (const load of loads) {
    const n1 = nodeIndexOf(graph, load.from)
    const n2 = nodeIndexOf(graph, load.to)
    const key = pairKey(n1, n2)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    degreeByNode.set(n1, (degreeByNode.get(n1) ?? 0) + 1)
    degreeByNode.set(n2, (degreeByNode.get(n2) ?? 0) + 1)
  }

  const uniquePairs = pairCounts.size
  if (uniquePairs === 1) {
    return { counts, topology: 'parallel' }
  }

  const hasParallelPair = [...pairCounts.values()].some((count) => count > 1)
  const maxDegree = Math.max(...degreeByNode.values())
  if (!hasParallelPair && maxDegree <= 2) {
    return { counts, topology: 'series' }
  }

  return { counts, topology: 'mixed' }
}
