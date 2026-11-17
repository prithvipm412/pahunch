import type { GridPoint } from '../contracts/netlist'
import type { Direction } from './machine'

// Classifies a drag delta as one of the four cardinal swipe directions, or null if the
// movement is too small to count as a swipe yet.
export function classifySwipe(dx: number, dy: number, minDistance: number): Direction | null {
  if (Math.hypot(dx, dy) < minDistance) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
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
