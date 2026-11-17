import type { CircuitComponent, GridPoint, Netlist } from '../contracts/netlist'
import { UnionFind } from './unionFind'

export function pointKey(p: GridPoint): string {
  return `${p.row},${p.col}`
}

export function isClosedSwitch(c: CircuitComponent): boolean {
  return c.type === 'switch' && c.closed === true
}

export function isOpenSwitch(c: CircuitComponent): boolean {
  return c.type === 'switch' && c.closed !== true
}

export interface WireEdge {
  component: CircuitComponent
  // true if this edge merged two previously-distinct nodes (spanning-tree edge);
  // false if its endpoints were already connected (a redundant/parallel wire).
  isTree: boolean
}

export interface CircuitGraph {
  nodeIndexByPointKey: Map<string, number>
  nodeCount: number
  finiteComponents: CircuitComponent[]
  wireEdges: WireEdge[]
  // Open switches and blown fuses: deliberately excluded from both wireEdges and
  // finiteComponents — a genuine gap in the circuit, same treatment for both.
  openComponents: CircuitComponent[]
  islandByNode: number[]
  islandHasBattery: Set<number>
  groundNodeByIsland: Map<number, number>
}

export function nodeIndexOf(graph: CircuitGraph, p: GridPoint): number {
  const idx = graph.nodeIndexByPointKey.get(pointKey(p))
  if (idx === undefined) throw new Error('unknown grid point')
  return idx
}

// Treat an ammeter as an ideal zero-resistance wire (merged into the graph, not stamped as a
// finite resistor) rather than a literal ~0.001Ω finite resistor. That's what makes its current
// recoverable via the same spanning-tree subtree-sum as a wire's (computeWireResults, generic
// over any wireEdges component), AND is exactly why an ammeter wired straight across a battery
// merges the battery's two terminal nodes and gets flagged short_circuit (validate.ts's
// `n1 === n2` check) — the same real lesson a literal wire there teaches.
function isAmmeter(c: CircuitComponent): boolean {
  return c.type === 'ammeter'
}

// An intact fuse also behaves like a wire (zero resistance) until it blows; `blownFuseIds`
// (computed by solve()'s iterative re-solve loop, not part of the netlist itself) says which
// fuses have already blown and must instead be treated as a gap, like an open switch.
function isIntactFuse(c: CircuitComponent, blownFuseIds: ReadonlySet<string>): boolean {
  return c.type === 'fuse' && !blownFuseIds.has(c.id)
}

function isBlownFuse(c: CircuitComponent, blownFuseIds: ReadonlySet<string>): boolean {
  return c.type === 'fuse' && blownFuseIds.has(c.id)
}

export function buildGraph(netlist: Netlist, blownFuseIds: ReadonlySet<string> = new Set()): CircuitGraph {
  const wireUF = new UnionFind()
  const wireEdges: WireEdge[] = []
  const openComponents: CircuitComponent[] = []
  const finiteComponents: CircuitComponent[] = []

  for (const c of netlist.components) {
    if (c.type === 'wire' || isClosedSwitch(c) || isAmmeter(c) || isIntactFuse(c, blownFuseIds)) {
      const isTree = wireUF.union(pointKey(c.from), pointKey(c.to))
      wireEdges.push({ component: c, isTree })
    } else if (isOpenSwitch(c) || isBlownFuse(c, blownFuseIds)) {
      openComponents.push(c)
    } else {
      finiteComponents.push(c)
    }
  }

  const rootToIndex = new Map<string, number>()
  const nodeIndexByPointKey = new Map<string, number>()
  let nextIndex = 0

  const registerPoint = (p: GridPoint) => {
    const key = pointKey(p)
    if (nodeIndexByPointKey.has(key)) return
    const root = wireUF.find(key)
    let idx = rootToIndex.get(root)
    if (idx === undefined) {
      idx = nextIndex++
      rootToIndex.set(root, idx)
    }
    nodeIndexByPointKey.set(key, idx)
  }

  for (const c of netlist.components) {
    registerPoint(c.from)
    registerPoint(c.to)
  }

  const nodeCount = nextIndex

  const islandUF = new UnionFind()
  for (let i = 0; i < nodeCount; i++) islandUF.find(String(i))
  for (const c of finiteComponents) {
    const n1 = nodeIndexByPointKey.get(pointKey(c.from)) as number
    const n2 = nodeIndexByPointKey.get(pointKey(c.to)) as number
    islandUF.union(String(n1), String(n2))
  }

  const islandByNode: number[] = new Array(nodeCount)
  const islandRootToId = new Map<string, number>()
  let nextIslandId = 0
  for (let i = 0; i < nodeCount; i++) {
    const root = islandUF.find(String(i))
    let id = islandRootToId.get(root)
    if (id === undefined) {
      id = nextIslandId++
      islandRootToId.set(root, id)
    }
    islandByNode[i] = id
  }

  const islandHasBattery = new Set<number>()
  for (const c of finiteComponents) {
    if (c.type === 'battery') {
      const n1 = nodeIndexByPointKey.get(pointKey(c.from)) as number
      islandHasBattery.add(islandByNode[n1])
    }
  }

  const groundNodeByIsland = new Map<number, number>()
  for (let i = 0; i < nodeCount; i++) {
    const islandId = islandByNode[i]
    if (!groundNodeByIsland.has(islandId)) {
      groundNodeByIsland.set(islandId, i)
    }
  }

  return {
    nodeIndexByPointKey,
    nodeCount,
    finiteComponents,
    wireEdges,
    openComponents,
    islandByNode,
    islandHasBattery,
    groundNodeByIsland,
  }
}

// Connectivity between a and b using every component except excludeComponentId (closed switches
// and wires merge nodes; resistors/bulbs/batteries/voltmeters also conduct, however little
// current a voltmeter's huge resistance lets through — same as any other finite resistance here.
// Ammeter and fuse conduct too: this is a purely structural, pre-solve check with no notion of a
// fuse having blown yet, so — like buildGraph's default `blownFuseIds` — every fuse here is
// assumed intact).
export function pointsConnectedExcluding(
  netlist: Netlist,
  excludeComponentId: string,
  a: GridPoint,
  b: GridPoint,
): boolean {
  const uf = new UnionFind()
  for (const c of netlist.components) {
    if (c.id === excludeComponentId) continue
    if (
      c.type === 'wire' ||
      isClosedSwitch(c) ||
      c.type === 'resistor' ||
      c.type === 'bulb' ||
      c.type === 'battery' ||
      c.type === 'ammeter' ||
      c.type === 'voltmeter' ||
      c.type === 'fuse'
    ) {
      uf.union(pointKey(c.from), pointKey(c.to))
    }
  }
  return uf.connected(pointKey(a), pointKey(b))
}
