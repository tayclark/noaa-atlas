// Pure text matching for the graph search box (#33). Case-insensitive; every whitespace-separated
// query term must appear somewhere in a node's haystack.

import { THEME_LABELS, type GraphNode } from '../../data/graphSchema'
import type { DatasetCatalog } from '../../data/nceiDatasets'
import type { Task } from '../../data/taskSchema'

export type SearchIndex = Map<string, string>

/** Dataset words are added only once the catalog has loaded (#269); until then nodes match on their own fields. */
export function buildSearchIndex(nodes: GraphNode[], tasks: Task[], datasets: DatasetCatalog | null = null): SearchIndex {
  const taskLabelsByNode = new Map<string, string[]>()
  for (const task of tasks) {
    for (const { nodeId } of task.nodes) {
      taskLabelsByNode.set(nodeId, [...(taskLabelsByNode.get(nodeId) ?? []), task.label])
    }
  }

  const index: SearchIndex = new Map()
  for (const node of nodes) {
    const parts =
      node.kind === 'service'
        ? [
            node.name,
            node.shortName ?? '',
            node.summary,
            ...node.tags,
            ...node.formats,
            node.owner.office,
            node.owner.program,
            THEME_LABELS[node.theme],
            ...(taskLabelsByNode.get(node.id) ?? []),
            // Datasets (#70) are reached through their service, so a dataset term highlights it.
            ...(datasets?.forService(node.id) ?? []).flatMap((d) => [d.name, ...d.observationTypes]),
          ]
        : [node.name]
    index.set(node.id, parts.join(' ').toLowerCase())
  }
  return index
}

/** Returns null for an empty query (no filtering), otherwise the set of matching node ids. */
export function matchNodeIds(index: SearchIndex, query: string): Set<string> | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null
  const matches = new Set<string>()
  for (const [id, haystack] of index) {
    if (terms.every((term) => haystack.includes(term))) matches.add(id)
  }
  return matches
}
