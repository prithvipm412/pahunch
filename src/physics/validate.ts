import type { Netlist } from '../contracts/netlist'
import { buildGraph, nodeIndexOf, pointsConnectedExcluding } from './graph'

export const ERROR_EMPTY = 'empty'
export const ERROR_NO_BATTERY = 'no_battery'
export const ERROR_SHORT_CIRCUIT = 'short_circuit'
export const ERROR_OPEN_CIRCUIT = 'open_circuit'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

export function validate(netlist: Netlist): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (netlist.components.length === 0) {
    errors.push(ERROR_EMPTY)
    return { errors, warnings }
  }

  const batteries = netlist.components.filter((c) => c.type === 'battery')
  if (batteries.length === 0) {
    errors.push(ERROR_NO_BATTERY)
    return { errors, warnings }
  }

  const graph = buildGraph(netlist)

  let shortCircuit = false
  let openCircuit = false
  for (const battery of batteries) {
    const n1 = nodeIndexOf(graph, battery.from)
    const n2 = nodeIndexOf(graph, battery.to)
    if (n1 === n2) shortCircuit = true
    if (!pointsConnectedExcluding(netlist, battery.id, battery.from, battery.to)) {
      openCircuit = true
    }
  }
  if (shortCircuit) errors.push(ERROR_SHORT_CIRCUIT)
  if (openCircuit) errors.push(ERROR_OPEN_CIRCUIT)

  for (const c of netlist.components) {
    if (c.type === 'switch' && c.closed !== true) continue
    const n1 = nodeIndexOf(graph, c.from)
    const islandId = graph.islandByNode[n1]
    if (!graph.islandHasBattery.has(islandId)) {
      warnings.push(`floating:${c.id}`)
    }
  }

  return { errors, warnings }
}
