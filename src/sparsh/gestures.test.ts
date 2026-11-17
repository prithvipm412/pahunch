import { describe, expect, it } from 'vitest'
import {
  classifySwipe,
  DOUBLE_TAP_MAX_DIST,
  isEdgeStart,
  isPairedTap,
  ONE_FINGER_DOUBLE_TAP_WINDOW_MS,
  pointFromClient,
  resolveFingerClass,
  TWO_FINGER_DOUBLE_TAP_WINDOW_MS,
} from './gestures'

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

// Regression for the real-phone bug where every one-finger double-tap landed as two separate
// single taps (so the part picker always reopened on "Wire" instead of advancing): a real
// double-tap's two taps can land anywhere from well under a second to ~2s apart, especially
// under accessibility touch passthrough, and the picker's pairing window must cover that.
describe('isPairedTap: one-finger double-tap timing (real-phone gaps)', () => {
  it.each([500, 900, 1400, 2000])('pairs a 1-finger double-tap with a %dms gap', (gapMs) => {
    expect(isPairedTap(gapMs, 0, 50, 50, 55, 48, ONE_FINGER_DOUBLE_TAP_WINDOW_MS, DOUBLE_TAP_MAX_DIST)).toBe(true)
  })

  it('still rejects a gap beyond the window, so an old single tap can never pair with an unrelated later one', () => {
    expect(isPairedTap(3000, 0, 50, 50, 55, 48, ONE_FINGER_DOUBLE_TAP_WINDOW_MS, DOUBLE_TAP_MAX_DIST)).toBe(false)
  })

  it('the narrower 2-finger window would have missed these same real-world gaps (why it needed its own constant)', () => {
    for (const gapMs of [500, 900, 1400, 2000]) {
      expect(isPairedTap(gapMs, 0, 50, 50, 55, 48, TWO_FINGER_DOUBLE_TAP_WINDOW_MS, DOUBLE_TAP_MAX_DIST)).toBe(false)
    }
  })
})

describe('resolveFingerClass', () => {
  it('uses the maximum finger count seen during the whole gesture', () => {
    expect(resolveFingerClass([1])).toBe(1)
    expect(resolveFingerClass([1, 1, 1, 0])).toBe(1)
  })

  it('a late-joining second finger still resolves the gesture to 2', () => {
    // finger 1 lands (count 1), a short beat passes, finger 2 joins (count 2), both lift
    expect(resolveFingerClass([1, 1, 2, 2, 1, 0])).toBe(2)
  })

  it('a late-joining third finger still resolves the gesture to 3', () => {
    expect(resolveFingerClass([1, 2, 2, 3, 2, 0])).toBe(3)
  })

  it('caps at 3 even if more fingers somehow touch down', () => {
    expect(resolveFingerClass([1, 2, 3, 4, 5])).toBe(3)
  })

  it('returns 0 for no samples', () => {
    expect(resolveFingerClass([])).toBe(0)
  })
})

describe('isEdgeStart', () => {
  const screenWidth = 400

  it('flags a start near the left edge', () => {
    expect(isEdgeStart(10, screenWidth, 24)).toBe(true)
  })

  it('flags a start near the right edge', () => {
    expect(isEdgeStart(390, screenWidth, 24)).toBe(true)
  })

  it('does not flag a start in the middle of the screen', () => {
    expect(isEdgeStart(200, screenWidth, 24)).toBe(false)
  })
})
