// Mirrors the selection in the URL hash (#266), and the hash back into the selection on load and on
// Back/Forward. The only module that touches `location` and `history`; the rules are in
// selectionHash.ts.

import { buildGraph } from './buildGraph'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'
import { formatSelectionHash, historyModeFor, parseSelectionHash, type KnownIds } from './selectionHash'
import type { Selection } from './selectionStore'
import { clearSelection, getSelectionSnapshot, selectNode, selectPoint, selectTask, subscribeSelection } from './selectionStore'
import { parseTasksFile } from './taskSchema'
import tasksJson from './tasks.json'

const known: KnownIds = {
  nodeIds: new Set(buildGraph(parseGraphFile(graphJson)).nodes.map((node) => node.id)),
  taskIds: new Set(parseTasksFile(tasksJson).tasks.map((task) => task.id)),
}

function apply(selection: Selection | null): void {
  if (selection?.selectedNodeId) selectNode(selection.selectedNodeId)
  else if (selection?.selectedTaskId) selectTask(selection.selectedTaskId)
  else if (selection?.selectedPoint) selectPoint(selection.selectedPoint)
  else clearSelection()
}

/** Applies the page's hash, then keeps the hash and the selection in step. Returns a stop function. */
export function startUrlSync(): () => void {
  const fromHash = () => apply(parseSelectionHash(window.location.hash, known))
  // An unknown id or a malformed point is dropped from the address bar rather than left there.
  if (window.location.hash) {
    fromHash()
    const hash = formatSelectionHash(getSelectionSnapshot())
    if (hash !== window.location.hash) history.replaceState(history.state, '', hash || window.location.pathname + window.location.search)
  }

  const unsubscribe = subscribeSelection(() => {
    const selection = getSelectionSnapshot()
    const mode = historyModeFor(window.location.hash, selection)
    if (mode === 'none') return
    // Clearing keeps the path and query, so the GitHub Pages base path stays.
    const url = formatSelectionHash(selection) || window.location.pathname + window.location.search
    if (mode === 'push') history.pushState(null, '', url)
    else history.replaceState(history.state, '', url)
  })

  // Back/Forward, or a hash typed into the address bar. Applying it writes nothing, since the
  // selection's hash then matches the address.
  window.addEventListener('popstate', fromHash)
  return () => {
    unsubscribe()
    window.removeEventListener('popstate', fromHash)
  }
}
