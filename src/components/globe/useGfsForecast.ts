import { useEffect, useState } from 'react'
import { windBlend } from './windTime'

const LOAD_DEBOUNCE_MS = 150

/** Two bracketing forecast hours of a GFS product, `t` being 0 at `a` and 1 at `b`. */
export interface BlendedField<G> {
  a: G
  b: G | null
  t: number
}

export type GfsForecast<G> =
  | { status: 'idle' }
  | { status: 'loading'; cycle: number | null; field: BlendedField<G> | null }
  | { status: 'ok'; cycle: number; field: BlendedField<G> }
  | { status: 'error'; message: string; cycle: number | null; field: BlendedField<G> | null }

/** What a product supplies to `useGfsForecast`. Pass a module-level constant so effects stay stable. */
export interface GfsSource<G> {
  getCycle: () => Promise<number>
  getField: (cycle: number, hour: number) => Promise<G>
  errorMessage: string
}

/**
 * A GFS field for the shared time (#229), loaded only while `shown`. The latest model cycle is found
 * once per show; each time change then loads the two bracketing forecast hours (debounced, so
 * dragging the slider does not fetch every hour it passes). The previous field stays on screen
 * while the next one loads.
 */
export function useGfsForecast<G>(source: GfsSource<G>, shown: boolean, time: number | null): GfsForecast<G> {
  const [cycle, setCycle] = useState<number | null>(null)
  const [field, setField] = useState<BlendedField<G> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shown) return
    let cancelled = false
    source
      .getCycle()
      .then((c) => {
        if (!cancelled) setCycle(c)
      })
      .catch(() => {
        if (!cancelled) setError(source.errorMessage)
      })
    return () => {
      cancelled = true
      setCycle(null)
      setField(null)
      setError(null)
    }
  }, [shown, source])

  useEffect(() => {
    if (!shown || cycle === null) return
    let cancelled = false
    const timer = setTimeout(() => {
      const { hourA, hourB, t } = windBlend(cycle, time ?? Date.now())
      Promise.all([source.getField(cycle, hourA), hourB === hourA ? null : source.getField(cycle, hourB)])
        .then(([a, b]) => {
          if (cancelled) return
          setField({ a, b, t })
          setError(null)
        })
        .catch(() => {
          if (!cancelled) setError(source.errorMessage)
        })
    }, LOAD_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [shown, cycle, time, source])

  if (!shown) return { status: 'idle' }
  if (error) return { status: 'error', message: error, cycle, field }
  if (cycle !== null && field) return { status: 'ok', cycle, field }
  return { status: 'loading', cycle, field }
}
