// The shared time axis (#74, #228): one instant that the radar slider, the point forecast timeline
// and, later, other time-aware layers read and write. Kept as a module-level store beside
// selectionStore.ts; components read it via `useSyncExternalStore`.

import { createStore } from './createStore'

export interface TimeRange {
  /** Epoch ms. */
  start: number
  end: number
}

/** The control that owns playback. Only one plays at a time, since each would otherwise drive the shared time. */
export type PlayerId = 'radar' | 'wind' | 'forecast' | 'storm'

export interface TimeState {
  /** Epoch ms, or null for "now" (the live edge, which follows the clock). */
  time: number | null
  /** Which control is looping the time, or null when none is. */
  player: PlayerId | null
  /** The span the active layers can show, or null when nothing time-aware is on screen. */
  range: TimeRange | null
}

const INITIAL: TimeState = { time: null, player: null, range: null }

const store = createStore<TimeState>(INITIAL, (a, b) => a.time === b.time && a.player === b.player && a.range === b.range)

function update(next: Partial<TimeState>): void {
  store.set({ ...store.get(), ...next })
}

/** Moves the shared time. Null returns to "now". */
export function setTime(time: number | null): void {
  update({ time })
}

/** Starts playback for one control, which stops whichever control was playing. */
export function startPlayer(player: PlayerId): void {
  update({ player })
}

/** Stops playback, but only if this control is the one playing: a scrub elsewhere must not cancel another loop. */
export function stopPlayer(player: PlayerId): void {
  if (store.get().player === player) update({ player: null })
}

/** Publishes the span the visible layers cover. Pass null when the last time-aware layer goes away. */
export function setRange(range: TimeRange | null): void {
  const current = store.get().range
  const same = range && current && range.start === current.start && range.end === current.end
  if (same || range === current) return
  update({ range })
}

/** Restores the initial state. Also intended for test isolation between cases. */
export function clearTime(): void {
  update(INITIAL)
}

export const subscribeTime = store.subscribe
export const getTimeSnapshot = store.get

/** Clamps a time into a range. */
export function clampToRange(time: number, range: TimeRange): number {
  return Math.min(range.end, Math.max(range.start, time))
}
