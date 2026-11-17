import type { Netlist, SolveResult } from '../contracts/netlist'

// TEMPORARY fake solver. L1 replaces the internals; the signature never changes.
export function solve(netlist: Netlist): SolveResult {
  return {
    ok: true,
    components: netlist.components.map((component) => ({
      id: component.id,
      voltage: 0,
      current: 0,
      power: 0,
      state: 'off',
    })),
    warnings: ['fake solver'],
    errors: [],
  }
}
