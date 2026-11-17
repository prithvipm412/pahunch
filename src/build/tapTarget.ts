export interface TapPoint { x: number; y: number }
export interface TapDot { row: number; col: number; x: number; y: number }
export interface PartHitSegment { id: string; from: TapPoint; to: TapPoint }

export type BuildTapTarget = { kind: 'dot'; row: number; col: number } | { kind: 'part'; id: string } | { kind: 'empty' }

function pointSegmentDistance(point: TapPoint, from: TapPoint, to: TapPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y)
  const projection = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
  if (projection < 0 || projection > 1) return Number.POSITIVE_INFINITY
  return Math.hypot(point.x - (from.x + projection * dx), point.y - (from.y + projection * dy))
}

/** Routes taps to nearby dots first, then to a part's middle selection zone when no tool is active. */
export function resolveBuildTapTarget(
  point: TapPoint,
  dots: readonly TapDot[],
  segments: readonly PartHitSegment[],
  toolActive: boolean,
  dotRadius = 18,
  partHitRadius = 10,
): BuildTapTarget {
  let nearestDot: TapDot | undefined
  let nearestDotDistance = dotRadius
  for (const dot of dots) {
    const distance = Math.hypot(point.x - dot.x, point.y - dot.y)
    if (distance <= nearestDotDistance) {
      nearestDot = dot
      nearestDotDistance = distance
    }
  }
  if (nearestDot) return { kind: 'dot', row: nearestDot.row, col: nearestDot.col }
  if (toolActive) return { kind: 'empty' }

  for (const segment of segments) {
    if (pointSegmentDistance(point, segment.from, segment.to) <= partHitRadius) return { kind: 'part', id: segment.id }
  }
  return { kind: 'empty' }
}

/** Returns the center 40% of a part segment, leaving its ends clear for dot taps. */
export function middlePartSegment(id: string, from: TapPoint, to: TapPoint): PartHitSegment {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return {
    id,
    from: { x: from.x + dx * 0.3, y: from.y + dy * 0.3 },
    to: { x: from.x + dx * 0.7, y: from.y + dy * 0.7 },
  }
}
