import type { GridPoint } from '../contracts/netlist'
import type { CircuitGraph, WireEdge } from './graph'
import { pointKey } from './graph'

export interface FiniteResult {
  voltage: number
  current: number
}

export interface WireResult {
  voltage: number
  current: number
}

// Current through an ideal (zero-resistance) wire/closed-switch can't be read
// off node voltages directly, since merged nodes share one voltage. Instead,
// for each spanning-tree wire edge, the current it carries is the net current
// injected by every resistor/bulb/battery attached anywhere in the subtree on
// one side of it (Kirchhoff's current law applied to that subtree as a whole,
// since the tree edge is its only link to the rest of the circuit). Redundant
// (cycle-forming) wire edges have no determinable split and report 0.
export function computeWireResults(
  graph: CircuitGraph,
  finiteResults: Map<string, FiniteResult>,
): Map<string, WireResult> {
  const results = new Map<string, WireResult>()

  const inj = new Map<string, number>()
  const addInj = (p: GridPoint, delta: number) => {
    const key = pointKey(p)
    inj.set(key, (inj.get(key) ?? 0) + delta)
  }

  for (const c of graph.finiteComponents) {
    const r = finiteResults.get(c.id)
    if (!r) continue
    addInj(c.from, -r.current)
    addInj(c.to, r.current)
  }

  const adjacency = new Map<string, Array<{ other: string; edge: WireEdge }>>()
  const addEdge = (a: string, b: string, edge: WireEdge) => {
    if (!adjacency.has(a)) adjacency.set(a, [])
    adjacency.get(a)!.push({ other: b, edge })
  }

  for (const edge of graph.wireEdges) {
    results.set(edge.component.id, { voltage: 0, current: 0 })
    if (!edge.isTree) continue
    const a = pointKey(edge.component.from)
    const b = pointKey(edge.component.to)
    addEdge(a, b, edge)
    addEdge(b, a, edge)
  }

  const visited = new Set<string>()

  const dfs = (point: string): number => {
    visited.add(point)
    let sum = inj.get(point) ?? 0
    for (const { other, edge } of adjacency.get(point) ?? []) {
      if (visited.has(other)) continue
      const childSum = dfs(other)
      const fromKey = pointKey(edge.component.from)
      const sign = fromKey === other ? 1 : -1
      results.set(edge.component.id, { voltage: 0, current: sign * childSum })
      sum += childSum
    }
    return sum
  }

  for (const point of adjacency.keys()) {
    if (!visited.has(point)) dfs(point)
  }

  return results
}
