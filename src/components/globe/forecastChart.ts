// Scales and paths for the point forecast timeline (#228). The component only lays these out, so
// the geometry is unit-tested without a DOM.

export interface Point {
  x: number
  y: number
}

/** Maps `value` from [d0, d1] onto [r0, r1]; a flat domain lands in the middle of the range. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (value: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)
}

const fmt = (n: number) => Number(n.toFixed(1))

/** A polyline that lifts the pen at gaps (a null point), so missing hours are not bridged. */
export function linePath(points: (Point | null)[]): string {
  let d = ''
  let drawing = false
  for (const p of points) {
    if (!p) {
      drawing = false
      continue
    }
    d += `${drawing ? 'L' : 'M'}${fmt(p.x)},${fmt(p.y)}`
    drawing = true
  }
  return d
}

/** Like linePath, but each sample holds for `width` (NWS wave heights are steps, one per hour). */
export function stepPath(points: (Point | null)[], width: number): string {
  let d = ''
  let drawing = false
  for (const p of points) {
    if (!p) {
      drawing = false
      continue
    }
    d += `${drawing ? 'L' : 'M'}${fmt(p.x)},${fmt(p.y)}L${fmt(p.x + width)},${fmt(p.y)}`
    drawing = true
  }
  return d
}

/** The upper bound of a value axis: the data's max rounded up to a tidy step, never below `floor`. */
export function niceMax(max: number, floor: number): number {
  const target = Math.max(max, floor)
  const step = target <= 10 ? 2 : target <= 30 ? 5 : 10
  return Math.ceil(target / step) * step
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** "SW" for 225 degrees; the direction the wind blows from. */
export function compassPoint(degrees: number): string {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]
}

/** Epoch ms to the nearest chart x, for a cursor or "now" marker (null when off the chart). */
export function timeToX(time: number, start: number, end: number, left: number, right: number): number | null {
  if (time < start || time > end) return null
  return scaleLinear(start, end, left, right)(time)
}
