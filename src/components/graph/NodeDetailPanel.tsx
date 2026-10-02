// Node detail panel (#30): shows the full reference info for the currently selected graph node,
// a theme summary when a theme hub is selected (#145), or the atlas overview for the NOAA root (#148).
// Reads the shared selectionStore via useSyncExternalStore (#43's convention, same as
// InspectorPanel.tsx) rather than taking a prop, so it works regardless of what selects a node.
// The panel is the floating card of a wide screen; `NodeDetailContent` is the body it shares with
// the phone's bottom sheet (DetailSheet.tsx, #78).

import { useSyncExternalStore } from 'react'
import { getCompareSnapshot, subscribeCompare, toggleCompare } from '../../data/compareStore'
import { summarizeCoverage } from '../../data/coverageSummary'
import type { ServiceNode } from '../../data/graphSchema'
import { getSelectionSnapshot, subscribeSelection } from '../../data/selectionStore'
import { findGraphNode, type DetailNode } from './graphNodes'
import { formatAuth, formatFormats, formatFreshness, formatOwner, formatRateLimits, liveStatusLabel } from './nodeDetailFormat'
import { NodeDatasetsSection } from './NodeDatasetsSection'
import { NodeNeighborsSection } from './NodeNeighborsSection'
import { NodeSampleSection } from './NodeSampleSection'
import { RootDetailBody } from './RootDetailBody'
import { ThemeDetailBody } from './ThemeDetailBody'
import './NodeDetailPanel.css'

interface NodeDetailPanelProps {
  /** Collapsed to its title bar so it covers less of the graph (#141). Owned by GraphView, which re-frames on change. */
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function NodeDetailPanel({ collapsed, onToggleCollapsed }: NodeDetailPanelProps) {
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const node = findGraphNode(selection.selectedNodeId)

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
      {!collapsed && <NodeDetailContent node={node} />}
    </div>
  )
}

/**
 * What the detail shows for a node, under whatever title bar the host draws. `inSheet` leaves out
 * the live tag and the compare button, which the sheet keeps in its header.
 */
export function NodeDetailContent({ node, inSheet = false }: { node: DetailNode; inSheet?: boolean }) {
  if (node.kind === 'root') return <RootDetailBody />
  if (node.kind === 'theme') return <ThemeDetailBody node={node} />
  // Keyed so a new node starts fresh: a "Run sample" result, or a run still in flight, belongs to
  // the node it ran for and must not carry over to the next one (#262).
  return <NodeDetailBody key={node.id} node={node as ServiceNode} inSheet={inSheet} />
}

function NodeDetailBody({ node, inSheet }: { node: ServiceNode; inSheet: boolean }) {
  const compared = useSyncExternalStore(subscribeCompare, getCompareSnapshot).includes(node.id)
  return (
    <>
      {!inSheet && (
        <>
          <span className={`node-detail-live-tag ${node.liveLayer ? 'node-detail-live' : 'node-detail-not-live'}`}>
            {liveStatusLabel(node)}
          </span>
          <button type="button" className="node-detail-compare" aria-pressed={compared} onClick={() => toggleCompare(node.id)}>
            {compared ? 'Remove from compare' : 'Add to compare'}
          </button>
        </>
      )}
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
      <NodeDatasetsSection serviceId={node.id} />
      <NodeNeighborsSection nodeId={node.id} />
      {!node.liveLayer && node.notLiveReason && <p className="node-detail-not-live-reason">{node.notLiveReason}</p>}
      <a className="node-detail-docs-link" href={node.docUrl} target="_blank" rel="noreferrer">
        Official docs ↗
      </a>
    </>
  )
}
