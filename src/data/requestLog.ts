// In-memory log of live api.weather.gov and SWPC calls, fed by liveRequest.ts (#40, #54). Kept as
// a module-level store rather than React context/state, matching the rest of this codebase's
// no-state-library convention — components read it via `useSyncExternalStore`.

export type RequestLogStatus = 'success' | 'http-error' | 'parse-error' | 'network-error'

export interface RequestLogEntry {
  id: string
  method: 'GET'
  url: string
  path: string
  requestHeaders: Record<string, string>
  startedAt: number
  durationMs: number
  status: RequestLogStatus
  httpStatus?: number
  responseBody?: unknown
  errorMessage?: string
}

const MAX_ENTRIES = 50

let entries: RequestLogEntry[] = []
const listeners = new Set<() => void>()

/** Records a completed request/response (or failure) at the front of the log, capped at 50. */
export function pushLogEntry(entry: RequestLogEntry): void {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
  for (const listener of listeners) listener()
}

export function subscribeRequestLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRequestLogSnapshot(): RequestLogEntry[] {
  return entries
}

/** Clears the log. Intended for test isolation between cases. */
export function clearRequestLog(): void {
  entries = []
  for (const listener of listeners) listener()
}
