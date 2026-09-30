// The smallest longitude arc covering a set of longitude intervals, going round the circle (#80).
// A plain min/max breaks for anything touching both sides of the antimeridian, so this merges the
// intervals and cuts the circle at its widest gap. Pure; shared by the globe's fly target and the
// coverage summary text.

export type LonInterval = readonly [west: number, east: number]

export interface LonArc {
  /** Western edge, in [-180, 180]. */
  west: number
  /** Eastern edge; exceeds 180 when the arc crosses the antimeridian. */
  east: number
  /** Width in degrees of the longitude gap left outside the arc (0 for a full circle). */
  gap: number
}

/** Smallest arc covering every interval, or null when there are none. */
export function smallestLonArc(intervals: readonly LonInterval[]): LonArc | null {
  if (intervals.length === 0) return null
  const sorted = intervals.map(([w, e]) => [w, e] as [number, number]).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [west, east] of sorted) {
    const last = merged[merged.length - 1]
    if (last && west <= last[1]) last[1] = Math.max(last[1], east)
    else merged.push([west, east])
  }
  const first = merged[0] as [number, number]
  const last = merged[merged.length - 1] as [number, number]
  // The gap that wraps from the last interval's east edge over the antimeridian to the first's west edge.
  let gap = first[0] + 360 - last[1]
  let west = first[0]
  let east = last[1]
  for (let i = 0; i + 1 < merged.length; i++) {
    const [, gapStart] = merged[i] as [number, number]
    const [gapEnd] = merged[i + 1] as [number, number]
    if (gapEnd - gapStart > gap) {
      gap = gapEnd - gapStart
      // Everything outside this gap: from its far side, round through the antimeridian, back to its near side.
      west = gapEnd
      east = gapStart + 360
    }
  }
  return { west, east, gap }
}

/** Wraps a longitude to [-180, 180]; 180 stays 180. */
export function wrapLon(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon
  return ((((lon + 180) % 360) + 360) % 360) - 180
}
