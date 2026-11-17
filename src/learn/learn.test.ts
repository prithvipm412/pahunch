import { describe, it, expect } from 'vitest'
import { gradeResult, challengeAudio } from './index'
import { FAULT_PUZZLES } from './puzzles'
import { solve } from '../physics'
import { describeCircuit } from '../physics/describe'
import type { Netlist } from '../contracts/netlist'

describe('Learn mode: gradeResult with describeCircuit and SolveResult', () => {
  it('correctly grades two bulbs in series as both_dim', () => {
    const seriesNetlist: Netlist = {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    }
    const result = solve(seriesNetlist)
    const desc = describeCircuit(seriesNetlist)
    expect(desc.topology).toBe('series')
    expect(gradeResult(result, seriesNetlist)).toBe('both_dim')
  })

  it('correctly grades two bulbs in parallel as both_bright', () => {
    const parallelNetlist: Netlist = {
      gridSize: 3,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 2 }, to: { row: 0, col: 0 } },
      ],
    }
    const result = solve(parallelNetlist)
    const desc = describeCircuit(parallelNetlist)
    expect(desc.topology).toBe('parallel')
    expect(gradeResult(result, parallelNetlist)).toBe('both_bright')
  })

  it('grades open circuit with switch as both_off', () => {
    const switchNetlist: Netlist = {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    }
    const result = solve(switchNetlist)
    const desc = describeCircuit(switchNetlist)
    expect(desc.topology).toBe('incomplete')
    expect(gradeResult(result, switchNetlist)).toBe('both_off')
  })
})

describe('Learn mode: challengeAudio dynamic structural analysis', () => {
  it('identifies short circuit errors and suggests safe series connection', () => {
    const shortNetlist: Netlist = {
      gridSize: 3,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 0 } },
      ],
    }
    const result = solve(shortNetlist)
    const audio = challengeAudio('custom', shortNetlist, result)
    expect(audio.explain).toBe('explain_short')
    expect(audio.try).toBe('try_series')
  })

  it('identifies open circuits with a switch and suggests closing it', () => {
    const openSwitchNetlist: Netlist = {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'switch1', type: 'switch', from: { row: 0, col: 1 }, to: { row: 0, col: 2 }, closed: false },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    }
    const result = solve(openSwitchNetlist)
    const audio = challengeAudio('custom', openSwitchNetlist, result)
    expect(audio.explain).toBe('explain_open')
    expect(audio.try).toBe('try_switch')
  })
})

describe('Learn mode: Fault Hunt level goal-checks with describeCircuit and solve', () => {
  FAULT_PUZZLES.forEach((puzzle, i) => {
    it(`Puzzle ${i + 1} (${puzzle.id}) broken netlist fails and fixed netlist passes goal check`, () => {
      // Broken state check: fails solve() or topology
      const brokenResult = solve(puzzle.brokenNetlist)
      const brokenDesc = describeCircuit(puzzle.brokenNetlist)
      const brokenGoalMet = brokenResult.ok && brokenDesc.topology !== 'incomplete' && brokenDesc.topology !== 'empty'
      expect(brokenGoalMet).toBe(false)

      // Fixed state check: passes both solve() and topology
      const fixedResult = solve(puzzle.fixedNetlist)
      const fixedDesc = describeCircuit(puzzle.fixedNetlist)
      const fixedGoalMet = fixedResult.ok && fixedDesc.topology !== 'incomplete' && fixedDesc.topology !== 'empty'
      expect(fixedGoalMet).toBe(true)
      expect(fixedResult.ok).toBe(true)
      expect(fixedDesc.topology).toBe('series')
    })
  })
})
