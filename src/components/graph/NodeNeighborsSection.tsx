import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile, type GraphEdge } from '../../data/graphSchema'
import { getNeighbors } from '../../data/neighbors'
import { selectNode } from '../../data/selectionStore'
import { EDGE_TYPE_LABELS } from './graphLayout'

const graph = buildGraph(parseGraphFile(graphJson))
// Derived hierarchy edges: their label just repeats the neighbour's name, so it isn't shown.
const STRUCTURAL = new Set<GraphEdge['type']>(['root', 'theme'])

export function NodeNeighborsSection({ nodeId }: { nodeId: string }) {
  const groups = getNeighbors(graph, nodeId)
  if (groups.length === 0) return null

  return (
    <section className="node-neighbors" aria-label="Relationships">
      <h4>Relationships</h4>
      {groups.map((group) => (
        <div key={group.type} className="node-neighbors-group">
          <h5>{EDGE_TYPE_LABELS[group.type]}</h5>
          <ul>
            {group.neighbors.map((n) => (
              <li key={`${n.direction}-${n.node.id}`}>
                <button type="button" onClick={() => selectNode(n.node.id)}>
                  {n.node.name}
                </button>
                {!STRUCTURAL.has(group.type) && (
                  <span className="node-neighbors-direction">{n.direction === 'out' ? ' →' : ' ←'}</span>
                )}
                {!STRUCTURAL.has(group.type) && <span className="node-neighbors-reason">{n.label}</span>}
                {n.sourceUrl && (
                  <a href={n.sourceUrl} target="_blank" rel="noreferrer">
                    source ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
