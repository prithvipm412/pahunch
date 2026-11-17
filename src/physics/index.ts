import type { ComponentResult, Netlist, SolveResult } from '../contracts/netlist'
import {
  BATTERY_INTERNAL_RESISTANCE,
  BULB_BRIGHT_RATIO,
  BULB_DIM_RATIO,
  BULB_NORMAL_RATIO,
  BULB_OFF_RATIO,
  DEFAULT_BATTERY_VOLTAGE,
  DEFAULT_FUSE_RATING,
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

// One graph-build + MNA solve + current-recovery pass for a given set of already-blown fuses.
// null means the solve itself failed (singular matrix etc.) — never throws.
function runGraphPass(netlist: Netlist, blownFuseIds: ReadonlySet<string>) {
  const graph = buildGraph(netlist, blownFuseIds)
  const voltages = solveVoltages(graph)
  if (voltages === null) return null

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
  return { graph, voltages, finiteResults, wireResults }
}

// The real MNA solver. L1 owns this; the signature never changes.
export function solve(netlist: Netlist): SolveResult {
  const { errors, warnings } = validate(netlist)

  if (errors.includes('empty') || errors.includes('no_battery')) {
    return { ok: false, components: offResultsFor(netlist), warnings, errors }
  }

  try {
    const fuses = netlist.components.filter((c) => c.type === 'fuse')
    const blownFuseIds = new Set<string>()

    let pass = runGraphPass(netlist, blownFuseIds)
    if (!pass) {
      return {
        ok: false,
        components: offResultsFor(netlist),
        warnings: [...warnings, 'solver_failed'],
        errors: [...errors, 'solver_failed'],
      }
    }

    // Blow any fuse over its rating, re-solve with it now open, and repeat — opening one fuse
    // can redirect current through another and push IT over its own rating. Bounded by
    // fuses.length: every iteration that doesn't break blows at least one previously-intact
    // fuse, and there are only that many to blow.
    for (let i = 0; i < fuses.length; i++) {
      let newlyBlown = false
      for (const fuse of fuses) {
        if (blownFuseIds.has(fuse.id)) continue
        const reading = pass.wireResults.get(fuse.id)
        const rating = fuse.value ?? DEFAULT_FUSE_RATING
        if (reading && Math.abs(reading.current) > rating) {
          blownFuseIds.add(fuse.id)
          newlyBlown = true
        }
      }
      if (!newlyBlown) break

      const nextPass = runGraphPass(netlist, blownFuseIds)
      if (!nextPass) {
        return {
          ok: false,
          components: offResultsFor(netlist),
          warnings: [...warnings, 'solver_failed'],
          errors: [...errors, 'solver_failed'],
        }
      }
      pass = nextPass
    }

    const { graph, voltages, finiteResults, wireResults } = pass
    const resultById = new Map<string, ComponentResult>()

    for (const c of netlist.components) {
      if (c.type === 'switch' && c.closed !== true) {
        const n1 = nodeIndexOf(graph, c.from)
        const n2 = nodeIndexOf(graph, c.to)
        const voltage = voltages[n1] - voltages[n2]
        resultById.set(c.id, { id: c.id, voltage, current: 0, power: 0, state: 'off' })
        continue
      }

      if (c.type === 'fuse' && blownFuseIds.has(c.id)) {
        const n1 = nodeIndexOf(graph, c.from)
        const n2 = nodeIndexOf(graph, c.to)
        const voltage = voltages[n1] - voltages[n2]
        resultById.set(c.id, { id: c.id, voltage, current: 0, power: 0, state: 'blown' })
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

    const allWarnings = [...warnings]
    for (const c of netlist.components) {
      if (c.type === 'fuse' && blownFuseIds.has(c.id)) allWarnings.push(`fuse_blown:${c.id}`)
    }

    return { ok: allErrors.length === 0, components, warnings: allWarnings, errors: allErrors }
  } catch {
    return {
      ok: false,
      components: offResultsFor(netlist),
      warnings: [...warnings, 'solver_failed'],
      errors: [...errors, 'solver_failed'],
    }
  }
}
