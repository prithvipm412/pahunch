import { describe, expect, it } from 'vitest'
import { classifySwipe, isPairedTap, pointFromClient } from './gestures'

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

describe('isPairedTap', () => {
  it('pairs a tap that is close in both time and distance', () => {
    expect(isPairedTap(1200, 1000, 50, 50, 55, 48, 350, 44)).toBe(true)
  })

  it('does not pair a tap outside the time window', () => {
    expect(isPairedTap(1400, 1000, 50, 50, 52, 50, 350, 44)).toBe(false)
  })

  it('does not pair a tap outside the distance window', () => {
    expect(isPairedTap(1100, 1000, 50, 50, 150, 50, 350, 44)).toBe(false)
  })
})
