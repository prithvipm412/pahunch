import type { ComponentResult, Netlist, SolveResult } from '../contracts/netlist'
import {
  BATTERY_INTERNAL_RESISTANCE,
  BULB_BRIGHT_RATIO,
  BULB_DIM_RATIO,
  BULB_NORMAL_RATIO,
  BULB_OFF_RATIO,
  DEFAULT_BATTERY_VOLTAGE,
  SHORT_CIRCUIT_CURRENT_LIMIT,
} from './constants'
import { buildGraph, nodeIndexOf } from './graph'
import { batteryVoltageOf, resistanceOf, solveVoltages } from './mna'
import { ERROR_SHORT_CIRCUIT, validate } from './validate'
import type { FiniteResult } from './wireCurrents'
import { computeWireResults } from './wireCurrents'

const CURRENT_EPSILON = 1e-6

function offResultsFor(netlist: Netlist): ComponentResult[] {
  return netlist.components.map((c) => ({
    id: c.id,
    voltage: 0,
    current: 0,
    power: 0,
    state: 'off',
  }))
}

function bulbStateFor(power: number, resistance: number): ComponentResult['state'] {
  const pNom = (DEFAULT_BATTERY_VOLTAGE * DEFAULT_BATTERY_VOLTAGE) / resistance
  const ratio = pNom === 0 ? 0 : power / pNom
  if (ratio < BULB_OFF_RATIO) return 'off'
  if (ratio < BULB_DIM_RATIO) return 'dim'
  if (ratio < BULB_NORMAL_RATIO) return 'normal'
  if (ratio < BULB_BRIGHT_RATIO) return 'bright'
  return 'overload'
}

function genericStateFor(current: number): ComponentResult['state'] {
  const magnitude = Math.abs(current)
  if (magnitude < CURRENT_EPSILON) return 'off'
  if (magnitude > SHORT_CIRCUIT_CURRENT_LIMIT) return 'overload'
  return 'normal'
}

// The real MNA solver. L1 owns this; the signature never changes.
export function solve(netlist: Netlist): SolveResult {
  const { errors, warnings } = validate(netlist)

  if (errors.includes('empty') || errors.includes('no_battery')) {
    return { ok: false, components: offResultsFor(netlist), warnings, errors }
  }

  try {
    const graph = buildGraph(netlist)
    const voltages = solveVoltages(graph)

    if (voltages === null) {
      return {
        ok: false,
        components: offResultsFor(netlist),
        warnings: [...warnings, 'solver_failed'],
        errors: [...errors, 'solver_failed'],
      }
    }

    const finiteResults = new Map<string, FiniteResult>()
    for (const c of graph.finiteComponents) {
      const n1 = nodeIndexOf(graph, c.from)
      const n2 = nodeIndexOf(graph, c.to)
      const voltage = voltages[n1] - voltages[n2]
      const current =
        c.type === 'battery'
          ? (voltage - batteryVoltageOf(c)) / BATTERY_INTERNAL_RESISTANCE
          : voltage / resistanceOf(c)
      finiteResults.set(c.id, { voltage, current })
    }

    const wireResults = computeWireResults(graph, finiteResults)

    const resultById = new Map<string, ComponentResult>()

    for (const c of netlist.components) {
      if (c.type === 'switch' && c.closed !== true) {
        const n1 = nodeIndexOf(graph, c.from)
        const n2 = nodeIndexOf(graph, c.to)
        const voltage = voltages[n1] - voltages[n2]
        resultById.set(c.id, { id: c.id, voltage, current: 0, power: 0, state: 'off' })
        continue
      }

      const finite = finiteResults.get(c.id)
      if (finite) {
        const power = finite.voltage * finite.current
        const state =
          c.type === 'bulb' ? bulbStateFor(power, resistanceOf(c)) : genericStateFor(finite.current)
        resultById.set(c.id, {
          id: c.id,
          voltage: finite.voltage,
          current: finite.current,
          power,
          state,
        })
        continue
      }

      const wire = wireResults.get(c.id)
      if (wire) {
        resultById.set(c.id, {
          id: c.id,
          voltage: wire.voltage,
          current: wire.current,
          power: wire.voltage * wire.current,
          state: genericStateFor(wire.current),
        })
        continue
      }

      resultById.set(c.id, { id: c.id, voltage: 0, current: 0, power: 0, state: 'off' })
    }

    const components = netlist.components.map((c) => resultById.get(c.id) as ComponentResult)

    const allErrors = [...errors]
    const anyBatteryOvercurrent = graph.finiteComponents.some(
      (c) =>
        c.type === 'battery' &&
        Math.abs(finiteResults.get(c.id)?.current ?? 0) > SHORT_CIRCUIT_CURRENT_LIMIT,
    )
    if (anyBatteryOvercurrent && !allErrors.includes(ERROR_SHORT_CIRCUIT)) {
      allErrors.push(ERROR_SHORT_CIRCUIT)
    }

    return { ok: allErrors.length === 0, components, warnings, errors: allErrors }
  } catch {
    return {
      ok: false,
      components: offResultsFor(netlist),
      warnings: [...warnings, 'solver_failed'],
      errors: [...errors, 'solver_failed'],
    }
  }
}
