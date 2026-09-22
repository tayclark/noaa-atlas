// Live request/response inspector for api.weather.gov calls (#40). Reads the shared
// requestLog store (fed by nwsClient.ts's request()) via useSyncExternalStore — no state
// library in this repo, and the log already lives outside React so multiple mounts share it.

import { useState, useSyncExternalStore } from 'react'
import { toCurlCommand, toFetchSnippet } from '../../data/copyAsCode'
import { getRequestLogSnapshot, subscribeRequestLog, type RequestLogEntry } from '../../data/requestLog'
import { formatTimestamp, statusColorClass, statusLabel, truncatePath } from './inspectorFormat'
import './InspectorPanel.css'

function EntryDetail({ entry }: { entry: RequestLogEntry }) {
  const body =
    entry.status === 'network-error' || entry.status === 'http-error'
      ? (entry.errorMessage ?? 'No response body.')
      : JSON.stringify(entry.responseBody, null, 2)

  return (
    <div className="inspector-detail">
      <div className="inspector-detail-url">{entry.url}</div>
      <dl className="inspector-detail-headers">
        {Object.entries(entry.requestHeaders).map(([key, value]) => (
          <div key={key} className="inspector-detail-header-row">
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="inspector-detail-actions">
        <button type="button" onClick={() => void navigator.clipboard.writeText(toCurlCommand(entry))}>
          Copy as curl
        </button>
        <button type="button" onClick={() => void navigator.clipboard.writeText(toFetchSnippet(entry))}>
          Copy as fetch
        </button>
      </div>
      <pre className="inspector-detail-body">{body}</pre>
    </div>
  )
}

export function InspectorPanel() {
  const entries = useSyncExternalStore(subscribeRequestLog, getRequestLogSnapshot)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0]

  if (entries.length === 0) {
    return (
      <div className="inspector-panel">
        <p className="inspector-empty">No live requests yet.</p>
      </div>
    )
  }

  return (
    <div className="inspector-panel">
      <ul className="inspector-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={`inspector-list-item ${entry.id === selected?.id ? 'inspector-list-item-selected' : ''}`}
              onClick={() => setSelectedId(entry.id)}
            >
              <span className={statusColorClass(entry)}>{statusLabel(entry)}</span>
              <span className="inspector-list-path">{truncatePath(entry.path, 40)}</span>
              <span className="inspector-list-time">{formatTimestamp(entry.startedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && <EntryDetail entry={selected} />}
    </div>
  )
}
