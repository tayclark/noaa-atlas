// Live request/response inspector for api.weather.gov and SWPC calls (#40, #54). Reads the shared
// requestLog store (fed by liveRequest.ts) via useSyncExternalStore — no state
// library in this repo, and the log already lives outside React so multiple mounts share it.
// Rows are an accordion (#150): each expands its own detail in place and they start collapsed,
// so the list stays scannable however large a response is.

import { useState, useSyncExternalStore } from 'react'
import { toCurlCommand, toFetchSnippet } from '../../data/copyAsCode'
import { clearRequestLog, getRequestLogSnapshot, subscribeRequestLog, type RequestLogEntry } from '../../data/requestLog'
import { CopyButton } from '../CopyButton'
import { formatTimestamp, statusColorClass, statusLabel, truncatePath } from './inspectorFormat'
import { JsonTree } from './JsonTree'
import './InspectorPanel.css'

// The log keeps only some response bodies, to bound its memory (#265).
const BODY_OMITTED_TEXT: Record<NonNullable<RequestLogEntry['bodyOmitted']>, string> = {
  superseded: 'Older response not kept. Only the newest response for each URL is held in memory.',
  'over-budget': 'Older response not kept. Newer responses filled the space the log keeps for bodies.',
}

function EntryDetail({ entry }: { entry: RequestLogEntry }) {
  const failed = entry.status === 'network-error' || entry.status === 'http-error'
  const headers = Object.entries(entry.requestHeaders)

  return (
    <div className="inspector-detail" id={`inspector-detail-${entry.id}`}>
      <div className="inspector-detail-url">{entry.url}</div>
      <div className="inspector-detail-actions">
        <CopyButton label="Copy as curl" text={toCurlCommand(entry)} />
        <CopyButton label="Copy as fetch" text={toFetchSnippet(entry)} />
      </div>
      <details className="inspector-detail-section">
        <summary>Request headers ({headers.length})</summary>
        <dl className="inspector-detail-headers">
          {headers.map(([key, value]) => (
            <div key={key} className="inspector-detail-header-row">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="inspector-detail-section">
        <div className="inspector-detail-section-title">Response</div>
        {failed ? (
          <pre className="inspector-detail-body" tabIndex={0} aria-label="Error message">{entry.errorMessage ?? 'No response body.'}</pre>
        ) : entry.bodyOmitted ? (
          <p className="inspector-detail-body inspector-detail-omitted">{BODY_OMITTED_TEXT[entry.bodyOmitted]}</p>
        ) : (
          <div className="inspector-detail-body">
            <JsonTree value={entry.responseBody} />
          </div>
        )}
      </div>
    </div>
  )
}

export function InspectorPanel() {
  const entries = useSyncExternalStore(subscribeRequestLog, getRequestLogSnapshot)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <div className="inspector-panel">
        <p className="inspector-empty">No live requests yet. Click the globe to look up a forecast.</p>
      </div>
    )
  }

  return (
    <div className="inspector-panel">
      <div className="inspector-toolbar">
        <span className="inspector-count">
          {entries.length} {entries.length === 1 ? 'request' : 'requests'}, newest first
        </span>
        <button type="button" onClick={() => clearRequestLog()}>
          Clear
        </button>
      </div>
      <ul className="inspector-list">
        {entries.map((entry) => {
          const expanded = entry.id === expandedId
          return (
            <li key={entry.id} className={expanded ? 'inspector-list-entry-expanded' : undefined}>
              <button
                type="button"
                className="inspector-list-item"
                aria-expanded={expanded}
                aria-controls={expanded ? `inspector-detail-${entry.id}` : undefined}
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                <span className="inspector-list-chevron" aria-hidden="true">
                  {expanded ? '▾' : '▸'}
                </span>
                <span className={statusColorClass(entry)}>{statusLabel(entry)}</span>
                <span className="inspector-list-path">{truncatePath(entry.path, 40)}</span>
                <span className="inspector-list-time">{formatTimestamp(entry.startedAt)}</span>
              </button>
              {expanded && <EntryDetail entry={entry} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
