import type { CircuitComponent, GridPoint } from '../contracts/netlist'

export interface WireSegment {
  from: GridPoint
  to: GridPoint
}

const pointKey = (point: GridPoint) => `${point.row},${point.col}`
const segmentKey = (from: GridPoint, to: GridPoint) => [pointKey(from), pointKey(to)].sort().join('|')

/** Adds a snapped point, filling skipped axis-aligned dots and popping snake backtracks. */
export function extendWireDragPath(path: readonly GridPoint[], next: GridPoint): GridPoint[] {
  if (path.length === 0) return [next]
  const last = path[path.length - 1]
  const horizontal = last.row === next.row
  const vertical = last.col === next.col
  if ((!horizontal && !vertical) || (last.row === next.row && last.col === next.col)) return [...path]

  const distance = horizontal ? next.col - last.col : next.row - last.row
  const step = Math.sign(distance)
  const updated = [...path]
  for (let index = 1; index <= Math.abs(distance); index += 1) {
    const point = horizontal ? { row: last.row, col: last.col + step * index } : { row: last.row + step * index, col: last.col }
    if (updated.length > 1) {
      const previous = updated[updated.length - 2]
      if (previous.row === point.row && previous.col === point.col) {
        updated.pop()
        continue
      }
    }
    updated.push(point)
  }
  return updated
}

/** Returns true when two component symbols would overlap on the same grid segment or crossing. */
export function componentsOverlap(first: CircuitComponent, second: CircuitComponent): boolean {
  const firstHorizontal = first.from.row === first.to.row
  const secondHorizontal = second.from.row === second.to.row
  if (firstHorizontal === secondHorizontal) {
    const firstAxis = firstHorizontal ? first.from.row : first.from.col
    const secondAxis = secondHorizontal ? second.from.row : second.from.col
    const firstStart = firstHorizontal ? Math.min(first.from.col, first.to.col) : Math.min(first.from.row, first.to.row)
    const firstEnd = firstHorizontal ? Math.max(first.from.col, first.to.col) : Math.max(first.from.row, first.to.row)
    const secondStart = secondHorizontal ? Math.min(second.from.col, second.to.col) : Math.min(second.from.row, second.to.row)
    const secondEnd = secondHorizontal ? Math.max(second.from.col, second.to.col) : Math.max(second.from.row, second.to.row)
    if (firstAxis === secondAxis && Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd)) return true
  }
  const center = (component: CircuitComponent) => ({ x: (component.from.col + component.to.col) / 2, y: (component.from.row + component.to.row) / 2 })
  const a = center(first), b = center(second)
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.55
}

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
