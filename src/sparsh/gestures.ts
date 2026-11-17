import type { GridPoint } from '../contracts/netlist'
import type { Direction } from './machine'

// The 1-finger double-tap pairing window — opens/advances the part picker, or toggles a placed
// switch. On a real phone (especially under accessibility touch passthrough) the gap between
// the two taps of one intended double-tap routinely runs well past the snappy ~300ms a mouse
// click-pair needs, up to roughly 2s — too tight a window here was why every double-tap landed
// as two separate single taps instead of one DOUBLE_TAP, so the picker always reopened on "Wire"
// instead of advancing. Wide enough to cover that, with margin.
export const ONE_FINGER_DOUBLE_TAP_WINDOW_MS = 2500
// The 2-finger double-tap pairing window (restart lesson) — unaffected by the above, kept at the
// original snappy timing since it isn't the gesture that was misfiring.
export const TWO_FINGER_DOUBLE_TAP_WINDOW_MS = 350
export const DOUBLE_TAP_MAX_DIST = 44

// Classifies a drag delta as one of the four cardinal swipe directions, or null if the
// movement is too small to count as a swipe yet.
export function classifySwipe(dx: number, dy: number, minDistance: number): Direction | null {
  if (Math.hypot(dx, dy) < minDistance) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

// True if a tap at (x, y) at time `now` is close enough in time and space to the previous tap
// (lastTime, lastX, lastY) to pair with it as a double-tap. Shared by the single-finger and
// two-finger double-tap detectors in index.tsx.
export function isPairedTap(
  now: number,
  lastTime: number,
  lastX: number,
  lastY: number,
  x: number,
  y: number,
  windowMs: number,
  maxDistance: number,
): boolean {
  return now - lastTime < windowMs && Math.hypot(x - lastX, y - lastY) < maxDistance
}

// The finger count a whole gesture should be classified as, given every touches.length sample
// observed from the first finger touching down to the last one lifting. Using the maximum
// (capped at 3, since no gesture uses more) means a finger that joins a little late still
// promotes the gesture to 2 (or 3) fingers, instead of the gesture being read as whatever the
// finger count happened to be at the instant it's checked.
export function resolveFingerClass(samples: number[]): number {
  return Math.min(Math.max(0, ...samples), 3)
}

// True if a gesture starting at `x` (in viewport pixels) begins inside the Android
// system-back-gesture zone at either screen edge, where our own swipe handling should stay out
// of the way and dispatch nothing.
export function isEdgeStart(x: number, screenWidth: number, zonePx: number): boolean {
  return x < zonePx || x > screenWidth - zonePx
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Maps a raw touch point to the nearest grid dot, given the on-screen rect spanning the grid's
// outermost dots (so the grid's first dot sits at the rect's top-left corner and the last dot at
// its bottom-right corner).
export function pointFromClient(clientX: number, clientY: number, rect: Rect, gridSize: number): GridPoint {
  const cellWidth = rect.width / (gridSize - 1)
  const cellHeight = rect.height / (gridSize - 1)
  const col = Math.round((clientX - rect.left) / cellWidth)
  const row = Math.round((clientY - rect.top) / cellHeight)
  return {
    row: Math.min(Math.max(row, 0), gridSize - 1),
    col: Math.min(Math.max(col, 0), gridSize - 1),
  }
}
