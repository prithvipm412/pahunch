import { describe, expect, it } from 'vitest'
import type { CircuitComponent, ComponentType, GridPoint, Netlist } from '../contracts/netlist'
import { solve } from './index'

import ammeterAcrossBattery from '../contracts/fixtures/ammeter-across-battery.json'
import ammeterSeries from '../contracts/fixtures/ammeter-series.json'
import brokenWire from '../contracts/fixtures/broken-wire.json'
import bulbResistorSeries from '../contracts/fixtures/bulb-resistor-series.json'
import fuseBlownParallel from '../contracts/fixtures/fuse-blown-parallel.json'
import fuseIntactParallel from '../contracts/fixtures/fuse-intact-parallel.json'
import oneBulb from '../contracts/fixtures/one-bulb.json'
import shortCircuit from '../contracts/fixtures/short-circuit.json'
import switchClosed from '../contracts/fixtures/switch-closed.json'
import switchOpen from '../contracts/fixtures/switch-open.json'
import threeBulbsMixed from '../contracts/fixtures/three-bulbs-mixed.json'
import twoBatteriesSeriesBulb from '../contracts/fixtures/two-batteries-series-bulb.json'
import twoBulbsParallel from '../contracts/fixtures/two-bulbs-parallel.json'
import twoBulbsSeries from '../contracts/fixtures/two-bulbs-series.json'
import voltmeterParallelBulb from '../contracts/fixtures/voltmeter-parallel-bulb.json'
import voltmeterSeries from '../contracts/fixtures/voltmeter-series.json'

interface Fixture {
  name: string
  netlist: Netlist
  expected: {
    ok: boolean
    errors: string[]
    bulbStates: Record<string, string>
    // Optional: only asserted when the fixture specifies it, so every fixture written before
    // ammeter/voltmeter/fuse (which never produced warnings) is unaffected.
    warnings?: string[]
  }
}

const fixtures: Fixture[] = [
  oneBulb,
  twoBulbsSeries,
  twoBulbsParallel,
  switchOpen,
  switchClosed,
  bulbResistorSeries,
  shortCircuit,
  brokenWire,
  threeBulbsMixed,
  twoBatteriesSeriesBulb,
  ammeterSeries,
  ammeterAcrossBattery,
  voltmeterParallelBulb,
  voltmeterSeries,
  fuseBlownParallel,
  fuseIntactParallel,
] as Fixture[]

describe('solve fixtures', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const result = solve(fixture.netlist)

      expect(result.ok).toBe(fixture.expected.ok)
      expect(result.errors.sort()).toEqual([...fixture.expected.errors].sort())
      if (fixture.expected.warnings) {
        expect(result.warnings.sort()).toEqual([...fixture.expected.warnings].sort())
      }

      for (const [id, state] of Object.entries(fixture.expected.bulbStates)) {
        const componentResult = result.components.find((c) => c.id === id)
        expect(componentResult, `missing result for ${id}`).toBeDefined()
        expect(componentResult?.state, `${fixture.name}: ${id}`).toBe(state)
      }
    })
  }
})

describe('solve general behavior', () => {
  it('never throws on an empty netlist', () => {
    const netlist: Netlist = { gridSize: 4, components: [], source: 'build' }
    expect(() => solve(netlist)).not.toThrow()
    const result = solve(netlist)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('empty')
  })

  it('never throws when there is no battery', () => {
    const netlist: Netlist = {
      gridSize: 4,
      source: 'build',
      components: [
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 0 } },
      ],
    }
    expect(() => solve(netlist)).not.toThrow()
    const result = solve(netlist)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('no_battery')
  })

  it('series current is lower than parallel current for identical bulbs', () => {
    const seriesResult = solve(twoBulbsSeries.netlist as Netlist)
    const parallelResult = solve(twoBulbsParallel.netlist as Netlist)

    const seriesCurrent = Math.abs(
      seriesResult.components.find((c) => c.id === 'bulb1')?.current ?? 0,
    )
    const parallelCurrent = Math.abs(
      parallelResult.components.find((c) => c.id === 'bulb1')?.current ?? 0,
    )

    expect(seriesCurrent).toBeGreaterThan(0)
    expect(parallelCurrent).toBeGreaterThan(0)
    expect(seriesCurrent).toBeLessThan(parallelCurrent)
  })

  it("an ammeter in series reads the loop's current", () => {
    const result = solve(ammeterSeries.netlist as Netlist)
    const ammeter = result.components.find((c) => c.id === 'ammeter1')
    const bulb = result.components.find((c) => c.id === 'bulb1')
    expect(Math.abs(ammeter?.current ?? 0)).toBeGreaterThan(0)
    expect(ammeter?.current).toBeCloseTo(bulb?.current ?? NaN, 9) // same series loop, same current
  })

  it("a voltmeter in parallel with a bulb reads that bulb's voltage", () => {
    const result = solve(voltmeterParallelBulb.netlist as Netlist)
    const voltmeter = result.components.find((c) => c.id === 'voltmeter1')
    const bulb = result.components.find((c) => c.id === 'bulb1')
    expect(Math.abs(voltmeter?.voltage ?? 0)).toBeGreaterThan(0)
    expect(voltmeter?.voltage).toBeCloseTo(bulb?.voltage ?? NaN, 3) // negligible current drawn, so barely disturbs it
  })

  it('never throws on random netlists', () => {
    const componentTypes: ComponentType[] = [
      'battery',
      'bulb',
      'resistor',
      'switch',
      'wire',
      'ammeter',
      'voltmeter',
      'fuse',
    ]
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const randomPoint = (gridSize: number): GridPoint => ({
      row: Math.floor(rand() * gridSize),
      col: Math.floor(rand() * gridSize),
    })

    for (let trial = 0; trial < 200; trial++) {
      const gridSize = 4
      const componentCount = Math.floor(rand() * 8)
      const components: CircuitComponent[] = []
      for (let i = 0; i < componentCount; i++) {
        const type = componentTypes[Math.floor(rand() * componentTypes.length)]
        components.push({
          id: `c${i}`,
          type,
          from: randomPoint(gridSize),
          to: randomPoint(gridSize),
          value: rand() < 0.5 ? undefined : rand() * 20,
          closed: rand() < 0.5,
        })
      }
      const netlist: Netlist = { gridSize, components, source: 'build' }
      expect(() => solve(netlist)).not.toThrow()
      const result = solve(netlist)
      expect(result.components.length).toBe(components.length)
    }
  })
})
