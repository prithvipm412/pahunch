import { describe, expect, it } from 'vitest'
import { classifySwipe, pointFromClient } from './gestures'

describe('classifySwipe', () => {
  it('returns null below the distance threshold', () => {
    expect(classifySwipe(5, 5, 20)).toBeNull()
  })

  it('picks the dominant axis', () => {
    expect(classifySwipe(30, 5, 20)).toBe('right')
    expect(classifySwipe(-30, 5, 20)).toBe('left')
    expect(classifySwipe(5, 30, 20)).toBe('down')
    expect(classifySwipe(5, -30, 20)).toBe('up')
  })
})

describe('pointFromClient', () => {
  const rect = { left: 0, top: 0, width: 400, height: 400 }

  it('maps the corners of the rect to the grid corners', () => {
    expect(pointFromClient(0, 0, rect, 5)).toEqual({ row: 0, col: 0 })
    expect(pointFromClient(400, 400, rect, 5)).toEqual({ row: 4, col: 4 })
  })

  it('rounds to the nearest dot', () => {
    expect(pointFromClient(110, 90, rect, 5)).toEqual({ row: 1, col: 1 })
  })

  it('clamps out-of-bounds coordinates to the grid', () => {
    expect(pointFromClient(-50, 500, rect, 5)).toEqual({ row: 4, col: 0 })
  })
})
