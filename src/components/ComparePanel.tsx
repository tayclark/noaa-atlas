// Compare tab (#76): the services picked with a service's "Compare" toggle (or a task's "Compare these"),
// side by side on auth, formats, coverage and freshness. Reads compareStore via
// `useSyncExternalStore`, like the other panels.

import { useSyncExternalStore } from 'react'
import { clearCompare, getCompareSnapshot, removeCompare, subscribeCompare } from '../data/compareStore'
import type { ServiceNode } from '../data/graphSchema'
import { buildCompareRows } from './graph/compareRows'
import { findGraphNode } from './graph/graphNodes'
import { regionProps } from './regionProps'
import './ComparePanel.css'

export function ComparePanel() {
  const ids = useSyncExternalStore(subscribeCompare, getCompareSnapshot)
  const nodes = ids.flatMap((id) => {
    const node = findGraphNode(id)
    return node?.kind === 'service' ? [node] : []
  })

  if (nodes.length < 2) {
    return (
      <div className="compare-panel" {...regionProps('Compare services', { scrolls: true })}>
        <p className="compare-empty">
          Pick at least two services to compare. Use <strong>Compare</strong> in a service&apos;s details,
          or <strong>Compare these</strong> on a task.
        </p>
        {nodes.map((node) => (
          <CompareChip key={node.id} node={node} />
        ))}
      </div>
    )
  }

  return (
    <div className="compare-panel" {...regionProps('Compare services', { scrolls: true })}>
      <div className="compare-toolbar">
        <button type="button" onClick={clearCompare}>
          Clear all
        </button>
      </div>
      <table className="compare-table">
        <thead>
          <tr>
            <td />
            {nodes.map((node) => (
              <th key={node.id} scope="col">
                <span className="compare-name">{node.name}</span>
                <button type="button" aria-label={`Remove ${node.name} from compare`} onClick={() => removeCompare(node.id)}>
                  <span aria-hidden="true">✕</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buildCompareRows(nodes).map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, i) => (
                <td key={nodes[i].id}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompareChip({ node }: { node: ServiceNode }) {
  return (
    <p className="compare-chip">
      {node.name}
      <button type="button" aria-label={`Remove ${node.name} from compare`} onClick={() => removeCompare(node.id)}>
        <span aria-hidden="true">✕</span>
      </button>
    </p>
  )
}
