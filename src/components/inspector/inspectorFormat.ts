// Pure display helpers for InspectorPanel.tsx (#40), kept testable and out of JSX.

import type { RequestLogEntry } from '../../data/requestLog'

export function statusLabel(entry: RequestLogEntry): string {
  switch (entry.status) {
    case 'success':
      return `${entry.httpStatus ?? 200} OK`
    case 'http-error':
      return `${entry.httpStatus ?? '—'} Error`
    case 'parse-error':
      return `${entry.httpStatus ?? '—'} Parse error`
    case 'network-error':
      return 'Network error'
  }
}

export function statusColorClass(entry: RequestLogEntry): string {
  return entry.status === 'success' ? 'inspector-status-ok' : 'inspector-status-error'
}

export function truncatePath(path: string, max: number): string {
  if (path.length <= max) return path
  return `${path.slice(0, Math.max(0, max - 1))}…`
}

export function formatTimestamp(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString()
}
