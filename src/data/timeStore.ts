// The shared time axis (#74, #228): one instant that the radar slider, the point forecast timeline
// and, later, other time-aware layers read and write. Kept as a module-level store beside
// selectionStore.ts; components read it via `useSyncExternalStore`.

export interface TimeRange {
  /** Epoch ms. */
  start: number
  end: number
}

export interface TimeState {
  /** Epoch ms, or null for "now" (the live edge, which follows the clock). */
  time: number | null
  playing: boolean
  /** The span the active layers can show, or null when nothing time-aware is on screen. */
  range: TimeRange | null
}

const INITIAL: TimeState = { time: null, playing: false, range: null }

let state: TimeState = INITIAL
const listeners = new Set<() => void>()

function update(next: Partial<TimeState>): void {
  const merged = { ...state, ...next }
  if (merged.time === state.time && merged.playing === state.playing && merged.range === state.range) return
  state = merged
  for (const listener of listeners) listener()
}

/** Moves the shared time. Null returns to "now". */
export function setTime(time: number | null): void {
  update({ time })
}

export function setPlaying(playing: boolean): void {
  update({ playing })
}

/** Publishes the span the visible layers cover. Pass null when the last time-aware layer goes away. */
export function setRange(range: TimeRange | null): void {
  const same = range && state.range && range.start === state.range.start && range.end === state.range.end
  if (same || range === state.range) return
  update({ range })
}

/** Restores the initial state. Also intended for test isolation between cases. */
export function resetTime(): void {
  update(INITIAL)
}

export function subscribeTime(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTimeSnapshot(): TimeState {
  return state
}

/** Clamps a time into a range. */
export function clampToRange(time: number, range: TimeRange): number {
  return Math.min(range.end, Math.max(range.start, time))
}
