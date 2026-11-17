import { describe, expect, it } from 'vitest'
import type { Netlist } from '../contracts/netlist'
import { describeCircuit } from './describe'

import brokenWire from '../contracts/fixtures/broken-wire.json'
import bulbResistorSeries from '../contracts/fixtures/bulb-resistor-series.json'
import oneBulb from '../contracts/fixtures/one-bulb.json'
import shortCircuit from '../contracts/fixtures/short-circuit.json'
import switchClosed from '../contracts/fixtures/switch-closed.json'
import switchOpen from '../contracts/fixtures/switch-open.json'
import threeBulbsMixed from '../contracts/fixtures/three-bulbs-mixed.json'
import twoBatteriesSeriesBulb from '../contracts/fixtures/two-batteries-series-bulb.json'
import twoBulbsParallel from '../contracts/fixtures/two-bulbs-parallel.json'
import twoBulbsSeries from '../contracts/fixtures/two-bulbs-series.json'

interface Fixture {
  name: string
  netlist: Netlist
}

describe('describeCircuit topology', () => {
  const cases: Array<[Fixture, ReturnType<typeof describeCircuit>['topology']]> = [
    [oneBulb as Fixture, 'series'],
    [twoBulbsSeries as Fixture, 'series'],
    [bulbResistorSeries as Fixture, 'series'],
    [twoBatteriesSeriesBulb as Fixture, 'series'],
    [switchClosed as Fixture, 'series'],
    [twoBulbsParallel as Fixture, 'parallel'],
    [threeBulbsMixed as Fixture, 'mixed'],
    [switchOpen as Fixture, 'incomplete'],
    [brokenWire as Fixture, 'incomplete'],
    [shortCircuit as Fixture, 'incomplete'],
  ]

  for (const [fixture, expected] of cases) {
    it(`${fixture.name} -> ${expected}`, () => {
      expect(describeCircuit(fixture.netlist).topology).toBe(expected)
    })
  }

  it('reports empty for no components', () => {
    const netlist: Netlist = { gridSize: 5, components: [], source: 'sparsh' }
    const result = describeCircuit(netlist)
    expect(result.topology).toBe('empty')
    expect(result.counts).toEqual({ battery: 0, bulb: 0, resistor: 0, switch: 0, wire: 0 })
  })

  it('reports incomplete when there is no battery', () => {
    const netlist: Netlist = {
      gridSize: 4,
      source: 'sparsh',
      components: [
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 1 }, to: { row: 0, col: 0 } },
      ],
    }
    expect(describeCircuit(netlist).topology).toBe('incomplete')
  })

  it('counts each component type, including zero counts', () => {
    const result = describeCircuit(twoBulbsSeries.netlist as Netlist)
    expect(result.counts).toEqual({ battery: 1, bulb: 2, resistor: 0, switch: 0, wire: 1 })
  })

  it('reports mixed for a bulb in series with a parallel pair', () => {
    const netlist: Netlist = {
      gridSize: 5,
      source: 'sparsh',
      components: [
        { id: 'battery1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'resistor1', type: 'resistor', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
        { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
      ],
    }
    expect(describeCircuit(netlist).topology).toBe('mixed')
  })
})
