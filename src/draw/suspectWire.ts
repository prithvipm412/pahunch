/**
 * src/draw/suspectWire.ts — Suspect and interior wire detection for Draw mode.
 *
 * Detects:
 *  1. Phantom wires: wires that lie strictly inside the outer loop with no component on them.
 *  2. Suspect short-circuit wires: wires that create a short across a battery or carry overload current.
 */
import type { Netlist, CircuitComponent, SolveResult } from '../contracts/netlist'

export const HINT_SHORT_OR_PHANTOM_WIRE =
  'Your netlist has a wire that creates a short; check whether that wire is really drawn.'

/**
 * Checks whether a wire lies strictly inside the outer loop of the circuit
 * with no non-wire components on its path.
 */
export function findInteriorWires(netlist: Netlist): CircuitComponent[] {
  if (!netlist.components || netlist.components.length === 0) return []

  const allPoints = netlist.components.flatMap((c) => [c.from, c.to])
  const minRow = Math.min(...allPoints.map((p) => p.row))
  const maxRow = Math.max(...allPoints.map((p) => p.row))
  const minCol = Math.min(...allPoints.map((p) => p.col))
  const maxCol = Math.max(...allPoints.map((p) => p.col))

  const height = maxRow - minRow
  const width = maxCol - minCol

  // If bounding box has no interior span (< 2 in both directions), no wire is interior
  if (height < 2 && width < 2) return []

  const nonWireComponents = netlist.components.filter((c) => c.type !== 'wire')
  const wires = netlist.components.filter((c) => c.type === 'wire')

  const interiorWires: CircuitComponent[] = []

  for (const wire of wires) {
    const r1 = wire.from.row
    const c1 = wire.from.col
    const r2 = wire.to.row
    const c2 = wire.to.col

    // Case 1: Both endpoints lie strictly inside the bounding box
    const bothStrictlyInside =
      height >= 2 &&
      width >= 2 &&
      r1 > minRow &&
      r1 < maxRow &&
      c1 > minCol &&
      c1 < maxCol &&
      r2 > minRow &&
      r2 < maxRow &&
      c2 > minCol &&
      c2 < maxCol

    if (bothStrictlyInside) {
      interiorWires.push(wire)
      continue
    }

    // Case 2: Vertical wire cutting through the interior of the loop (col strictly between minCol and maxCol)
    if (width >= 2 && c1 === c2 && c1 > minCol && c1 < maxCol) {
      // Check if there is any non-wire component along this interior column
      const nonWireOnCol = nonWireComponents.some(
        (nw) =>
          (nw.from.col === c1 && nw.to.col === c1) ||
          (nw.from.col === c1 && nw.from.row > minRow && nw.from.row < maxRow) ||
          (nw.to.col === c1 && nw.to.row > minRow && nw.to.row < maxRow),
      )
      if (!nonWireOnCol) {
        interiorWires.push(wire)
        continue
      }
    }

    // Case 3: Horizontal wire cutting through the interior of the loop (row strictly between minRow and maxRow)
    if (height >= 2 && r1 === r2 && r1 > minRow && r1 < maxRow) {
      // Check if there is any non-wire component along this interior row
      const nonWireOnRow = nonWireComponents.some(
        (nw) =>
          (nw.from.row === r1 && nw.to.row === r1) ||
          (nw.from.row === r1 && nw.from.col > minCol && nw.from.col < maxCol) ||
          (nw.to.row === r1 && nw.to.col > minCol && nw.to.col < maxCol),
      )
      if (!nonWireOnRow) {
        interiorWires.push(wire)
        continue
      }
    }

    // Case 4: Wire with one endpoint strictly inside the bounding box and no non-wires connected to it
    if (height >= 2 && width >= 2) {
      const p1Inside = r1 > minRow && r1 < maxRow && c1 > minCol && c1 < maxCol
      const p2Inside = r2 > minRow && r2 < maxRow && c2 > minCol && c2 < maxCol
      if (p1Inside || p2Inside) {
        const touchesNonWire = nonWireComponents.some(
          (nw) =>
            (p1Inside &&
              ((nw.from.row === r1 && nw.from.col === c1) ||
                (nw.to.row === r1 && nw.to.col === c1))) ||
            (p2Inside &&
              ((nw.from.row === r2 && nw.from.col === c2) ||
                (nw.to.row === r2 && nw.to.col === c2))),
        )
        if (!touchesNonWire) {
          interiorWires.push(wire)
        }
      }
    }
  }

  return interiorWires
}

/**
 * Identifies suspect wires that either lie strictly inside the loop or
 * cause a short-circuit.
 */
export function findSuspectWires(
  netlist: Netlist,
  solveResult?: SolveResult,
): CircuitComponent[] {
  // 1. Interior wires without components on them
  const interior = findInteriorWires(netlist)
  if (interior.length > 0) {
    return interior
  }

  // 2. If short-circuit error is present in solveResult
  if (solveResult && solveResult.errors.includes('short_circuit')) {
    // A. Check for wires in overload state
    const overloadIds = new Set(
      solveResult.components
        .filter((c) => c.state === 'overload')
        .map((c) => c.id),
    )
    const overloadWires = netlist.components.filter(
      (c) => c.type === 'wire' && overloadIds.has(c.id),
    )
    if (overloadWires.length > 0) {
      return overloadWires
    }

    // B. Check for wire directly across a battery
    const batteries = netlist.components.filter((c) => c.type === 'battery')
    for (const bat of batteries) {
      const directShortWire = netlist.components.find(
        (c) =>
          c.type === 'wire' &&
          ((c.from.row === bat.from.row &&
            c.from.col === bat.from.col &&
            c.to.row === bat.to.row &&
            c.to.col === bat.to.col) ||
            (c.from.row === bat.to.row &&
              c.from.col === bat.to.col &&
              c.to.row === bat.from.row &&
              c.to.col === bat.from.col)),
      )
      if (directShortWire) {
        return [directShortWire]
      }
    }

    // C. Any wire carrying high current during the short
    const wires = netlist.components.filter((c) => c.type === 'wire')
    if (wires.length > 0) {
      const wireResults = solveResult.components.filter((cr) =>
        wires.some((w) => w.id === cr.id),
      )
      wireResults.sort((a, b) => Math.abs(b.current) - Math.abs(a.current))
      if (wireResults.length > 0 && Math.abs(wireResults[0].current) > 0) {
        const topWire = wires.find((w) => w.id === wireResults[0].id)
        if (topWire) return [topWire]
      }
    }
  }

  return []
}
