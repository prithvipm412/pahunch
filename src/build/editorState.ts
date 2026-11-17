import type { CircuitComponent, Netlist } from '../contracts/netlist'

/** Minimal editor state for selection, removal, and undo transitions. */
export interface BuildEditorState {
  netlist: Netlist
  undoStack: Netlist[]
  selectedId: string | null
}

/** Selects a placed component in the Build editor. */
export function selectBuildPart(state: BuildEditorState, id: string | null): BuildEditorState {
  return { ...state, selectedId: id }
}

/** Removes the selected component and records the previous netlist for undo. */
export function removeSelectedBuildPart(state: BuildEditorState): BuildEditorState {
  if (!state.selectedId || !state.netlist.components.some((part) => part.id === state.selectedId)) return state
  const components: CircuitComponent[] = state.netlist.components.filter((part) => part.id !== state.selectedId)
  return {
    netlist: { ...state.netlist, components },
    undoStack: [...state.undoStack, state.netlist].slice(-30),
    selectedId: null,
  }
}

/** Restores the last saved netlist and clears selection. */
export function undoBuildAction(state: BuildEditorState): BuildEditorState {
  const previous = state.undoStack[state.undoStack.length - 1]
  if (!previous) return state
  return { netlist: previous, undoStack: state.undoStack.slice(0, -1), selectedId: null }
}
