// Node detail panel (#30): shows the full reference info for the currently selected graph node,
// or a theme summary when a theme hub is selected (#145).
// Reads the shared selectionStore via useSyncExternalStore (#43's convention, same as
// InspectorPanel.tsx) rather than taking a prop, so it works regardless of what selects a node.

import { useSyncExternalStore } from 'react'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { summarizeCoverage } from '../../data/coverageSummary'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile } from '../../data/graphSchema'
import { getSelectionSnapshot, subscribeSelection } from '../../data/selectionStore'
import { formatAuth, formatFormats, formatFreshness, formatOwner, formatRateLimits, liveStatusLabel } from './nodeDetailFormat'
import { NodeNeighborsSection } from './NodeNeighborsSection'
import { NodeSampleSection } from './NodeSampleSection'
import { ThemeDetailBody } from './ThemeDetailBody'
import './NodeDetailPanel.css'

const graphNodes = buildGraph(parseGraphFile(graphJson)).nodes

interface NodeDetailPanelProps {
  /** Collapsed to its title bar so it covers less of the graph (#141). Owned by GraphView, which re-frames on change. */
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function NodeDetailPanel({ collapsed, onToggleCollapsed }: NodeDetailPanelProps) {
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const node = selection.selectedNodeId ? graphNodes.find((n) => n.id === selection.selectedNodeId) : undefined

  if (!node) return null

  return (
    <div className={`node-detail-panel${collapsed ? ' node-detail-panel-collapsed' : ''}`} aria-label="Node detail">
      <div className="node-detail-header">
        <h3>{node.name}</h3>
        <button
          type="button"
          className="node-detail-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand details' : 'Collapse details'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!collapsed && (node.kind === 'theme' ? <ThemeDetailBody node={node} /> : <NodeDetailBody node={node} />)}
    </div>
  )
}

function NodeDetailBody({ node }: { node: ServiceNode }) {
  return (
    <>
      <span className={`node-detail-live-tag ${node.liveLayer ? 'node-detail-live' : 'node-detail-not-live'}`}>
        {liveStatusLabel(node)}
      </span>
      <dl>
        <div className="node-detail-row">
          <dt>Owner</dt>
          <dd>{formatOwner(node.owner)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Base URL</dt>
          <dd>
            <a href={node.baseUrl} target="_blank" rel="noreferrer">
              {node.baseUrl}
            </a>
          </dd>
        </div>
        <div className="node-detail-row">
          <dt>Formats</dt>
          <dd>{formatFormats(node.formats)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Auth</dt>
          <dd>{formatAuth(node.auth)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Rate limits</dt>
          <dd>{formatRateLimits(node.rateLimits)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Coverage</dt>
          <dd>{summarizeCoverage(node.coverage)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Freshness</dt>
          <dd>{formatFreshness(node.freshness)}</dd>
        </div>
        <div className="node-detail-row">
          <dt>Last verified</dt>
          <dd>{node.lastVerified}</dd>
        </div>
      </dl>
      <NodeSampleSection node={node} />
      <NodeNeighborsSection nodeId={node.id} />
      {!node.liveLayer && node.notLiveReason && <p className="node-detail-not-live-reason">{node.notLiveReason}</p>}
      <a className="node-detail-docs-link" href={node.docUrl} target="_blank" rel="noreferrer">
        Official docs ↗
      </a>
    </>
  )
}
