// Text for the graph's screen-reader live region (#86). Search results already announce
// themselves through GraphSearch's status; this covers what a sighted user sees happen on the
// graph when the selection changes, whether it came from the graph, the finder or the globe.

import type { Selection } from '../../data/selectionStore'

/** What changed in the selection, or '' when nothing is selected. */
export function selectionAnnouncement(
  selection: Selection,
  nodeNameById: ReadonlyMap<string, string>,
  taskTitleById: ReadonlyMap<string, string>,
  highlightedCount: number,
): string {
  if (selection.selectedNodeId) {
    const name = nodeNameById.get(selection.selectedNodeId)
    return name ? `Selected ${name}` : ''
  }
  if (selection.selectedTaskId) {
    const title = taskTitleById.get(selection.selectedTaskId)
    return title ? `Selected task: ${title}, ${highlightedCount} ${highlightedCount === 1 ? 'step' : 'steps'}` : ''
  }
  if (selection.selectedPoint) {
    return `Selected a map point covered by ${highlightedCount} ${highlightedCount === 1 ? 'service' : 'services'}`
  }
  return ''
}
