import { describe, expect, it } from 'vitest'
import type { Netlist } from '../contracts/netlist'
import { removeSelectedBuildPart, selectBuildPart, undoBuildAction } from './editorState'
import { createBuildComponent } from './componentFactory'

const netlist: Netlist = {
  gridSize: 5,
  source: 'build',
  components: [{ id: 'wire-1', type: 'wire', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
}

describe('Build selection removal and undo', () => {
  it('selects a part, removes it, then restores it with Undo', () => {
    const initial = { netlist, undoStack: [], selectedId: null }
    const selected = selectBuildPart(initial, 'wire-1')
    expect(selected.selectedId).toBe('wire-1')

    const removed = removeSelectedBuildPart(selected)
    expect(removed.netlist.components).toEqual([])
    expect(removed.selectedId).toBeNull()
    expect(removed.undoStack).toEqual([netlist])

    const undone = undoBuildAction(removed)
    expect(undone.netlist).toEqual(netlist)
    expect(undone.undoStack).toEqual([])
    expect(undone.selectedId).toBeNull()
  })

  it.each(['ammeter', 'voltmeter', 'fuse'] as const)('places, selects, removes, and restores a %s', (type) => {
    const part = createBuildComponent(type, `${type}-1`, { row: 1, col: 1 }, { row: 1, col: 2 })
    if (type === 'fuse') expect(part.value).toBe(0.5)
    else expect(part.value).toBeUndefined()

    const initial = { netlist: { ...netlist, components: [part] }, undoStack: [], selectedId: null }
    const selected = selectBuildPart(initial, part.id)
    const removed = removeSelectedBuildPart(selected)
    expect(removed.netlist.components).toEqual([])
    expect(removed.selectedId).toBeNull()

    const undone = undoBuildAction(removed)
    expect(undone.netlist.components).toEqual([part])
  })
})
