// Time arithmetic for the wind overlay (#229): GFS 1 degree files exist every 3 hours up to
// MAX_FORECAST_HOUR after the cycle, and the shared time (#228) can be any instant, so a time maps
// to two neighbouring files and a blend weight.

import { MAX_FORECAST_HOUR, STEP_HOURS } from '../../data/gfsClient'

const HOUR_MS = 3_600_000

export interface WindBlend {
  hourA: number
  /** Equal to `hourA` at the end of the range. */
  hourB: number
  /** 0 at `hourA`, up to 1 at `hourB`. */
  t: number
}

/** The file hours that bracket `time`, clamped to the cycle's range. */
export function windBlend(cycle: number, time: number): WindBlend {
  const hours = Math.min(MAX_FORECAST_HOUR, Math.max(0, (time - cycle) / HOUR_MS))
  const hourA = Math.floor(hours / STEP_HOURS) * STEP_HOURS
  const hourB = Math.min(MAX_FORECAST_HOUR, hourA + STEP_HOURS)
  return { hourA, hourB, t: hourB === hourA ? 0 : (hours - hourA) / STEP_HOURS }
}

/** Every slider step as an epoch time. */
export function windTimes(cycle: number): number[] {
  const out: number[] = []
  for (let h = 0; h <= MAX_FORECAST_HOUR; h += STEP_HOURS) out.push(cycle + h * HOUR_MS)
  return out
}

/** The slider index nearest `time`. */
export function windIndexForTime(cycle: number, time: number): number {
  const steps = Math.round((time - cycle) / HOUR_MS / STEP_HOURS)
  return Math.min(MAX_FORECAST_HOUR / STEP_HOURS, Math.max(0, steps))
}

/** "Thu 2 PM · +12 h" style label for the slider. */
export function formatWindTime(cycle: number, time: number): string {
  const when = new Date(time).toLocaleString([], { weekday: 'short', hour: 'numeric' })
  const hours = Math.round((time - cycle) / HOUR_MS)
  return `${when} · ${hours >= 0 ? '+' : ''}${hours} h`
}
