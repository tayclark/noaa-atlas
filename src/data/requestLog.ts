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
  /** Length of the response text, used to bound the bodies the log keeps (#265). */
  responseSize?: number
  /** Why `responseBody` was dropped: a newer response for the same URL, or the size budget. */
  bodyOmitted?: 'superseded' | 'over-budget'
  errorMessage?: string
}

const MAX_ENTRIES = 50
// About the newest OVATION grid (0.9M), active alerts (1.9M on a quiet day) and Kp together. A
// parsed body costs several times its text in heap, so 50 copies of the globe's feeds came to
// ~100 MB (#265).
export const BODY_BUDGET = 4_000_000

let entries: RequestLogEntry[] = []
const listeners = new Set<() => void>()

const omitBody = ({ responseBody: _dropped, ...entry }: RequestLogEntry, reason: 'superseded' | 'over-budget'): RequestLogEntry => ({
  ...entry,
  bodyOmitted: reason,
})

/**
 * Drops the response bodies the log no longer needs to hold (#265): an older response for a URL
 * that has a newer one, and, newest first, any body past `budget` characters of response text.
 * The newest entry keeps its body however large it is. Entries without a body are returned as is.
 */
export function trimBodies(log: readonly RequestLogEntry[], budget = BODY_BUDGET): RequestLogEntry[] {
  const urlsWithBody = new Set<string>()
  let used = 0
  return log.map((entry, i) => {
    if (entry.responseBody === undefined) return entry
    if (urlsWithBody.has(entry.url)) return omitBody(entry, 'superseded')
    urlsWithBody.add(entry.url)
    used += entry.responseSize ?? 0
    return used > budget && i > 0 ? omitBody(entry, 'over-budget') : entry
  })
}

/** Records a completed request/response (or failure) at the front of the log, capped at 50. */
export function pushLogEntry(entry: RequestLogEntry): void {
  entries = trimBodies([entry, ...entries].slice(0, MAX_ENTRIES))
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
