import { afterEach, describe, expect, it, vi } from 'vitest'
import { haptic, HAPTIC_PATTERNS, hapticDurationMs, hapticForCircuitStatus, isHapticsEnabled, setHapticsEnabled } from './haptics'

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear(),
    key: () => null,
    get length() { return data.size },
  }
}

describe('haptics: on/off setting', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to enabled when nothing is saved', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(isHapticsEnabled()).toBe(true)
  })

  it('persists and reads back a disabled setting', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    setHapticsEnabled(false)
    expect(isHapticsEnabled()).toBe(false)
    setHapticsEnabled(true)
    expect(isHapticsEnabled()).toBe(true)
  })

  it('defaults to enabled when localStorage itself is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(isHapticsEnabled()).toBe(true)
    expect(() => setHapticsEnabled(false)).not.toThrow()
  })
})

describe('haptics: haptic()', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing when navigator.vibrate is unsupported', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', {})
    expect(() => haptic('tap')).not.toThrow()
  })

  it('cancels any in-flight pattern before firing the named one (throttling)', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { vibrate })
    haptic('place_battery', { essential: true })
    expect(vibrate).toHaveBeenNthCalledWith(1, 0)
    expect(vibrate).toHaveBeenNthCalledWith(2, HAPTIC_PATTERNS.place_battery)
  })

  it('does nothing when the global setting is off', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { vibrate })
    setHapticsEnabled(false)
    haptic('tap', { essential: true })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('suppresses a decorative pattern under prefers-reduced-motion', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    haptic('tap')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('never suppresses circuit-status feedback under prefers-reduced-motion, even without essential:true', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    haptic('circuit_working')
    expect(vibrate).toHaveBeenCalled()
  })

  it('does not suppress a decorative pattern when essential is explicitly passed (e.g. from Sparsh)', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    haptic('tap', { essential: true })
    expect(vibrate).toHaveBeenCalled()
  })
})

describe('hapticForCircuitStatus', () => {
  it('maps every status to its named pattern', () => {
    expect(hapticForCircuitStatus('working')).toBe('circuit_working')
    expect(hapticForCircuitStatus('not_working')).toBe('circuit_not_working')
    expect(hapticForCircuitStatus('broken')).toBe('circuit_broken')
  })
})

describe('hapticDurationMs', () => {
  it('returns a scalar pattern as-is', () => {
    expect(hapticDurationMs('tap')).toBe(10)
    expect(hapticDurationMs('circuit_working')).toBe(600)
  })

  it('sums a multi-pulse pattern', () => {
    expect(hapticDurationMs('place_battery')).toBe(110) // [40, 30, 40]
    expect(hapticDurationMs('circuit_broken')).toBe(480) // [120, 60, 120, 60, 120]
  })
})
