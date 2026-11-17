import { describe, expect, it } from 'vitest'
import type { CircuitComponent } from '../contracts/netlist'
import { wireSegmentsForDragPath } from './wirePath'

const p = (row: number, col: number) => ({ row, col })

describe('wireSegmentsForDragPath', () => {
  it('fills skipped horizontal neighbours', () => {
    expect(wireSegmentsForDragPath([p(2, 0), p(2, 3)])).toEqual([
      { from: p(2, 0), to: p(2, 1) },
      { from: p(2, 1), to: p(2, 2) },
      { from: p(2, 2), to: p(2, 3) },
    ])
  })

  it('fills vertical neighbours while preserving drag direction', () => {
    expect(wireSegmentsForDragPath([p(4, 1), p(1, 1)])).toEqual([
      { from: p(4, 1), to: p(3, 1) },
      { from: p(3, 1), to: p(2, 1) },
      { from: p(2, 1), to: p(1, 1) },
    ])
  })

  it('ignores diagonal moves', () => {
    expect(wireSegmentsForDragPath([p(0, 0), p(1, 1), p(2, 2)])).toEqual([])
  })

  it('does not repeat edges when the path backtracks', () => {
    expect(wireSegmentsForDragPath([p(0, 0), p(0, 2), p(0, 0)])).toHaveLength(2)
  })

  it('skips a segment covered by an existing wire or part', () => {
    const existing: CircuitComponent[] = [
      { id: 'long-part', type: 'resistor', from: p(1, 1), to: p(1, 3), value: 10 },
    ]
    expect(wireSegmentsForDragPath([p(1, 0), p(1, 4)], existing)).toEqual([
      { from: p(1, 0), to: p(1, 1) },
      { from: p(1, 3), to: p(1, 4) },
    ])
  })
})
