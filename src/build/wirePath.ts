import type { CircuitComponent, GridPoint } from '../contracts/netlist'

export interface WireSegment {
  from: GridPoint
  to: GridPoint
}

const pointKey = (point: GridPoint) => `${point.row},${point.col}`
const segmentKey = (from: GridPoint, to: GridPoint) => [pointKey(from), pointKey(to)].sort().join('|')

function componentCoversSegment(component: CircuitComponent, segment: WireSegment): boolean {
  const { from, to } = component
  if (from.row === to.row && segment.from.row === segment.to.row && from.row === segment.from.row) {
    const componentMin = Math.min(from.col, to.col)
    const componentMax = Math.max(from.col, to.col)
    return Math.min(segment.from.col, segment.to.col) >= componentMin && Math.max(segment.from.col, segment.to.col) <= componentMax
  }
  if (from.col === to.col && segment.from.col === segment.to.col && from.col === segment.from.col) {
    const componentMin = Math.min(from.row, to.row)
    const componentMax = Math.max(from.row, to.row)
    return Math.min(segment.from.row, segment.to.row) >= componentMin && Math.max(segment.from.row, segment.to.row) <= componentMax
  }
  return false
}

/** Converts snapped drag points to unique adjacent axis-aligned edges, skipping occupied edges. */
export function wireSegmentsForDragPath(
  path: readonly GridPoint[],
  occupiedComponents: readonly CircuitComponent[] = [],
): WireSegment[] {
  const occupied = new Set<string>()
  const emitted = new Set<string>()
  const segments: WireSegment[] = []

  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]
    const end = path[index]
    const horizontal = start.row === end.row
    const vertical = start.col === end.col
    if ((!horizontal && !vertical) || (start.row === end.row && start.col === end.col)) continue

    const distance = horizontal ? end.col - start.col : end.row - start.row
    const step = Math.sign(distance)
    const count = Math.abs(distance)
    for (let part = 0; part < count; part += 1) {
      const from = horizontal ? { row: start.row, col: start.col + step * part } : { row: start.row + step * part, col: start.col }
      const to = horizontal ? { row: start.row, col: start.col + step * (part + 1) } : { row: start.row + step * (part + 1), col: start.col }
      const key = segmentKey(from, to)
      if (emitted.has(key)) continue
      emitted.add(key)
      if (occupied.has(key) || occupiedComponents.some((component) => componentCoversSegment(component, { from, to }))) continue
      segments.push({ from, to })
      occupied.add(key)
    }
  }

  return segments
}
