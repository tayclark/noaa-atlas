import type { Graph, GraphEdge, GraphNode } from './graphSchema'

export interface Neighbor {
  node: GraphNode
  label: string
  sourceUrl?: string
  direction: 'in' | 'out'
}

export interface NeighborGroup {
  type: GraphEdge['type']
  neighbors: Neighbor[]
}

const TYPE_ORDER: GraphEdge['type'][] = ['data-flow', 'shared-id', 'theme']

export function getNeighbors(graph: Graph, nodeId: string): NeighborGroup[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const groups = new Map<GraphEdge['type'], Neighbor[]>()

  for (const edge of graph.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    const direction = edge.source === nodeId ? 'out' : 'in'
    const other = byId.get(direction === 'out' ? edge.target : edge.source)
    if (!other) continue
    const list = groups.get(edge.type) ?? []
    list.push({ node: other, label: edge.label, sourceUrl: edge.sourceUrl, direction })
    groups.set(edge.type, list)
  }

  return TYPE_ORDER.flatMap((type) => {
    const neighbors = groups.get(type)
    if (!neighbors) return []
    return [{ type, neighbors: neighbors.sort((a, b) => a.node.name.localeCompare(b.node.name)) }]
  })
}
