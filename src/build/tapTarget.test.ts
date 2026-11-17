import { describe, expect, it } from 'vitest'
import { middlePartSegment, resolveBuildTapTarget } from './tapTarget'

const dots = [
  { row: 0, col: 0, x: 34, y: 34 },
  { row: 0, col: 1, x: 107, y: 34 },
]
const wire = middlePartSegment('wire-1', dots[0], dots[1])

describe('Build tap priority', () => {
  it('routes a tap on a dot next to a wire to placement, not wire selection', () => {
    const target = resolveBuildTapTarget({ x: 48, y: 34 }, dots, [wire], true)
    expect(target).toEqual({ kind: 'dot', row: 0, col: 0 })
  })

  it('selects the middle of a wire when no tool is active', () => {
    const target = resolveBuildTapTarget({ x: 70.5, y: 34 }, dots, [wire], false)
    expect(target).toEqual({ kind: 'part', id: 'wire-1' })
  })

  it('ignores part taps while a placement tool is active', () => {
    expect(resolveBuildTapTarget({ x: 70.5, y: 34 }, dots, [wire], true)).toEqual({ kind: 'empty' })
  })
})
