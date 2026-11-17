import { describe, expect, it } from 'vitest'
import { runSequence, RUN_STARTING_TEXT } from './runSequence'

describe('runSequence', () => {
  it('always starts with speak_starting and ends with sonify, for every status', () => {
    for (const status of ['working', 'not_working', 'broken'] as const) {
      const steps = runSequence(status)
      expect(steps[0]).toEqual({ kind: 'speak_starting' })
      expect(steps.at(-1)).toEqual({ kind: 'sonify' })
    }
  })

  it('places status_feedback (carrying the given status) right after speak_starting', () => {
    const steps = runSequence('broken')
    expect(steps[1]).toEqual({ kind: 'status_feedback', status: 'broken' })
  })

  it('places speak_result between status_feedback and sonify', () => {
    const steps = runSequence('working')
    expect(steps[2]).toEqual({ kind: 'speak_result' })
    expect(steps).toHaveLength(4)
  })

  it('has both an English and a Kannada "starting" line', () => {
    expect(RUN_STARTING_TEXT.en.length).toBeGreaterThan(0)
    expect(RUN_STARTING_TEXT.kn.length).toBeGreaterThan(0)
  })
})
