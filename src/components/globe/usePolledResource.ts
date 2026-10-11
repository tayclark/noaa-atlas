// A live feed the globe keeps fresh (#354): the SPC outlook, the storm tracks, the aurora, Kp and the
// alerts. It loads when enabled and is re-fetched every `intervalMs` while the globe is looked at
// (`active`), at once on return when the last fetch is older than that (#78). A failed refresh keeps
// the last good data; only a failure before the first success of this enable is an error, which
// `retryMs` (when given) retries sooner. Disabling it forgets everything, so the next enable starts
// from loading, and a response that lands after that is dropped.

import { useEffect, useRef, useState } from 'react'
import { pollWhileVisible } from '../../data/pollWhileVisible'
import { failedWith, loadedWith, LOADING, type AsyncState } from './asyncState'

export interface PolledResourceOptions {
  describeError: (err: unknown) => string
  /** How soon a failed first load is retried, while the globe is looked at. */
  retryMs?: number
}

/** `fetcher` and `describeError` should be module-level, so the load isn't restarted on every render. */
export function usePolledResource<T>(
  enabled: boolean,
  active: boolean,
  fetcher: () => Promise<T>,
  intervalMs: number,
  { describeError, retryMs }: PolledResourceOptions,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(LOADING)
  const loadRef = useRef<() => void>(() => {})
  const loadedAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let loaded = false
    loadRef.current = () => {
      loadedAtRef.current = Date.now()
      fetcher().then(
        (data) => {
          if (cancelled) return
          loaded = true
          setState(loadedWith(data))
        },
        (err: unknown) => {
          if (!cancelled && !loaded) setState(failedWith(describeError(err)))
        },
      )
    }
    loadRef.current()
    return () => {
      cancelled = true
      loadRef.current = () => {}
      setState(LOADING)
    }
  }, [enabled, fetcher, describeError])

  useEffect(() => {
    if (!enabled || !active) return
    if (Date.now() - loadedAtRef.current >= intervalMs) loadRef.current()
    return pollWhileVisible(() => loadRef.current(), intervalMs)
  }, [enabled, active, intervalMs])

  const failedFirst = state.status === 'error'
  useEffect(() => {
    if (!enabled || !active || !failedFirst || retryMs === undefined) return
    return pollWhileVisible(() => loadRef.current(), retryMs)
  }, [enabled, active, failedFirst, retryMs])

  return state
}
