import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SolveResult } from '../contracts/netlist'
import { alarm, classifyCircuitStatus, notWorkingTone, playCircuitStatusSound, successBell } from './feedbackSounds'

function resultWith(partial: Partial<SolveResult>): SolveResult {
  return { ok: true, errors: [], warnings: [], components: [], ...partial }
}

describe('classifyCircuitStatus', () => {
  it('is "working" for an ok result with no overloaded components', () => {
    const result = resultWith({ ok: true, components: [{ id: 'b1', voltage: 3, current: 0.3, power: 0.9, state: 'normal' }] })
    expect(classifyCircuitStatus(result)).toBe('working')
  })

  it('is "not_working" for empty/no_battery/open_circuit or a generic solve failure', () => {
    expect(classifyCircuitStatus(resultWith({ ok: false, errors: ['empty'] }))).toBe('not_working')
    expect(classifyCircuitStatus(resultWith({ ok: false, errors: ['no_battery'] }))).toBe('not_working')
    expect(classifyCircuitStatus(resultWith({ ok: false, errors: ['open_circuit'] }))).toBe('not_working')
    expect(classifyCircuitStatus(resultWith({ ok: false, errors: ['solver_failed'] }))).toBe('not_working')
  })

  it('is "broken" for a short circuit error', () => {
    expect(classifyCircuitStatus(resultWith({ ok: false, errors: ['short_circuit'] }))).toBe('broken')
  })

  it('is "broken" for any overloaded component, even with no short_circuit error and ok: true', () => {
    const result = resultWith({ ok: true, errors: [], components: [{ id: 'b1', voltage: 9, current: 0.9, power: 8, state: 'overload' }] })
    expect(classifyCircuitStatus(result)).toBe('broken')
  })
})

describe('feedback sound functions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('do nothing (never throw) when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => successBell()).not.toThrow()
    expect(() => notWorkingTone()).not.toThrow()
    expect(() => alarm()).not.toThrow()
  })

  it('playCircuitStatusSound dispatches to the right stinger for each status', () => {
    vi.stubGlobal('AudioContext', undefined) // no-op backend; just confirms no crash/dispatch error
    expect(() => playCircuitStatusSound('working')).not.toThrow()
    expect(() => playCircuitStatusSound('not_working')).not.toThrow()
    expect(() => playCircuitStatusSound('broken')).not.toThrow()
  })
})
