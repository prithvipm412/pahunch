import { describe, expect, it } from 'vitest'
import { solve } from '../../src/physics'
import type { ComponentResult, SolveResult } from '../../src/contracts/netlist'
import { PREDICT_QUESTIONS } from './predict'
import { FAULT_QUESTIONS } from './faults'

function stateOf(result: SolveResult, id: string): ComponentResult['state'] {
  const component = result.components.find((c) => c.id === id)
  if (!component) throw new Error(`component ${id} not found in solve result`)
  return component.state
}

describe('Predict questions: every netlist matches its authored correctKey', () => {
  it('p1: closed switch + bulb glows (Yes)', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p1')!
    const result = solve(q.netlist)
    expect(result.ok).toBe(true)
    expect(stateOf(result, 'bulb1')).not.toBe('off')
    expect(q.correctKey).toBe('yes')
  })

  it('p2: open switch + bulb stays off (No)', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p2')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('off')
    expect(q.correctKey).toBe('no')
  })

  it('p3: two bulbs in series are both dim', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p3')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('dim')
    expect(stateOf(result, 'bulb2')).toBe('dim')
    expect(q.correctKey).toBe('dimmer')
  })

  it('p4: two bulbs in parallel are both normal (same as alone)', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p4')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('normal')
    expect(stateOf(result, 'bulb2')).toBe('normal')
    expect(q.correctKey).toBe('about_same')
  })

  it('p5: series with a gap leaves the remaining bulb off', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p5')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('off')
    expect(q.correctKey).toBe('go_off')
  })

  it('p6: parallel with one bulb removed keeps the other lit', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p6')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).not.toBe('off')
    expect(q.correctKey).toBe('stay_on')
  })

  it('p7: bulb + 10 ohm resistor is dim', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p7')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('dim')
    expect(q.correctKey).toBe('dimmer')
  })

  it('p8: bulb + 100 ohm resistor is very dim or off', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p8')!
    const result = solve(q.netlist)
    expect(['off', 'dim']).toContain(stateOf(result, 'bulb1'))
    expect(q.correctKey).toBe('very_dim_or_off')
  })

  it('p9: 9V battery overloads the bulb', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p9')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulb1')).toBe('overload')
    expect(q.correctKey).toBe('brighter_overload')
  })

  it('p10: wire across Bulb A turns it off while Bulb B gets brighter', () => {
    const q = PREDICT_QUESTIONS.find((p) => p.id === 'p10')!
    const result = solve(q.netlist)
    expect(stateOf(result, 'bulbA')).toBe('off')
    expect(stateOf(result, 'bulbB')).not.toBe('off')
    expect(q.correctKey).toBe('a_off_b_brighter')
  })
})

describe('Fault Hunt puzzles: broken netlist is actually broken, fixed netlist actually works', () => {
  it('f1: broken wire leaves both bulbs off; fixed wire lights them dim', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f1')!
    const broken = solve(q.brokenNetlist)
    expect(stateOf(broken, 'bulb1')).toBe('off')
    expect(stateOf(broken, 'bulb2')).toBe('off')
    const fixed = solve(q.fixedNetlist)
    expect(stateOf(fixed, 'bulb1')).toBe('dim')
    expect(stateOf(fixed, 'bulb2')).toBe('dim')
    expect(q.faultyId).toBe('wire1')
  })

  it('f2: open switch leaves bulb off; closing it lights the bulb', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f2')!
    expect(stateOf(solve(q.brokenNetlist), 'bulb1')).toBe('off')
    expect(stateOf(solve(q.fixedNetlist), 'bulb1')).not.toBe('off')
    expect(q.faultyId).toBe('switch1')
  })

  it('f3: shorting wire trips short_circuit; removing it lights the bulb safely', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f3')!
    const broken = solve(q.brokenNetlist)
    expect(broken.errors).toContain('short_circuit')
    const fixed = solve(q.fixedNetlist)
    expect(fixed.errors).not.toContain('short_circuit')
    expect(stateOf(fixed, 'bulb1')).not.toBe('off')
    expect(q.faultyId).toBe('wire2')
  })

  it('f4: bypass wire turns Bulb A off; removing it lights both bulbs dim', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f4')!
    const broken = solve(q.brokenNetlist)
    expect(stateOf(broken, 'bulbA')).toBe('off')
    expect(stateOf(broken, 'bulbB')).not.toBe('off')
    const fixed = solve(q.fixedNetlist)
    expect(stateOf(fixed, 'bulbA')).toBe('dim')
    expect(stateOf(fixed, 'bulbB')).toBe('dim')
    expect(q.faultyId).toBe('bypassWire')
  })

  it('f5: 100ohm resistor leaves the bulb off; 10ohm lights it dim', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f5')!
    expect(stateOf(solve(q.brokenNetlist), 'bulb1')).toBe('off')
    expect(stateOf(solve(q.fixedNetlist), 'bulb1')).toBe('dim')
    expect(q.faultyId).toBe('resistor1')
  })

  it('f6: dead (open) bulb2 leaves both bulbs off; fixed lights both dim', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f6')!
    const broken = solve(q.brokenNetlist)
    expect(stateOf(broken, 'bulb1')).toBe('off')
    expect(stateOf(broken, 'bulb2')).toBe('off')
    const fixed = solve(q.fixedNetlist)
    expect(stateOf(fixed, 'bulb1')).toBe('dim')
    expect(stateOf(fixed, 'bulb2')).toBe('dim')
    expect(q.faultyId).toBe('bulb2')
  })

  it('f7: open branch switch leaves bulb2 off while bulb1 stays lit; fixed lights both normal', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f7')!
    const broken = solve(q.brokenNetlist)
    expect(stateOf(broken, 'bulb1')).not.toBe('off')
    expect(stateOf(broken, 'bulb2')).toBe('off')
    const fixed = solve(q.fixedNetlist)
    expect(stateOf(fixed, 'bulb1')).toBe('normal')
    expect(stateOf(fixed, 'bulb2')).toBe('normal')
    expect(q.faultyId).toBe('switch1')
  })

  it('f8: reversed battery cancels the other, bulb off; same direction lights it', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f8')!
    expect(stateOf(solve(q.brokenNetlist), 'bulb1')).toBe('off')
    expect(stateOf(solve(q.fixedNetlist), 'bulb1')).not.toBe('off')
    expect(q.faultyId).toBe('battery2')
  })

  it('f9: dead-end wire leaves bulb off; connecting it back lights the bulb', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f9')!
    expect(stateOf(solve(q.brokenNetlist), 'bulb1')).toBe('off')
    expect(stateOf(solve(q.fixedNetlist), 'bulb1')).not.toBe('off')
    expect(q.faultyId).toBe('wire1')
  })

  it('f10: 9V battery overloads the bulb; 3V is normal', () => {
    const q = FAULT_QUESTIONS.find((f) => f.id === 'f10')!
    expect(stateOf(solve(q.brokenNetlist), 'bulb1')).toBe('overload')
    expect(stateOf(solve(q.fixedNetlist), 'bulb1')).toBe('normal')
    expect(q.faultyId).toBe('battery1')
  })
})

describe('Fault Hunt puzzles: faultyId is always a real component in the broken netlist', () => {
  FAULT_QUESTIONS.forEach((q) => {
    it(`${q.id}: faultyId "${q.faultyId}" exists in brokenNetlist`, () => {
      expect(q.brokenNetlist.components.some((c) => c.id === q.faultyId)).toBe(true)
    })
  })
})
