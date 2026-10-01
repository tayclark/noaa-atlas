import { useEffect, useState } from 'react'
import { getLatestCycle, getWindField } from '../../data/gfsClient'
import type { WindFieldInput } from './windOverlay'
import { windBlend } from './windTime'

const LOAD_DEBOUNCE_MS = 150

export type WindForecast =
  | { status: 'idle' }
  | { status: 'loading'; cycle: number | null; field: WindFieldInput | null }
  | { status: 'ok'; cycle: number; field: WindFieldInput }
  | { status: 'error'; message: string; cycle: number | null; field: WindFieldInput | null }

/**
 * The wind field for the shared time (#229), loaded only while `shown`. The latest model cycle is
 * found once per show; each time change then loads the two bracketing forecast hours (debounced, so
 * dragging the slider does not fetch every hour it passes). The previous field stays on screen
 * while the next one loads.
 */
export function useWindForecast(shown: boolean, time: number | null): WindForecast {
  const [cycle, setCycle] = useState<number | null>(null)
  const [field, setField] = useState<WindFieldInput | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shown) return
    let cancelled = false
    getLatestCycle()
      .then((c) => {
        if (!cancelled) setCycle(c)
      })
      .catch(() => {
        if (!cancelled) setError('The GFS wind forecast could not be loaded.')
      })
    return () => {
      cancelled = true
      setCycle(null)
      setField(null)
      setError(null)
    }
  }, [shown])

  useEffect(() => {
    if (!shown || cycle === null) return
    let cancelled = false
    const timer = setTimeout(() => {
      const { hourA, hourB, t } = windBlend(cycle, time ?? Date.now())
      Promise.all([getWindField(cycle, hourA), hourB === hourA ? null : getWindField(cycle, hourB)])
        .then(([a, b]) => {
          if (cancelled) return
          setField({ a, b, t })
          setError(null)
        })
        .catch(() => {
          if (!cancelled) setError('The GFS wind forecast could not be loaded.')
        })
    }, LOAD_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [shown, cycle, time])

  if (!shown) return { status: 'idle' }
  if (error) return { status: 'error', message: error, cycle, field }
  if (cycle !== null && field) return { status: 'ok', cycle, field }
  return { status: 'loading', cycle, field }
}
