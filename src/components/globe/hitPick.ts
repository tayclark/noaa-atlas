// Which map feature a tap or click means (#78). Pure, so the rules are unit-tested: MapLibre's own
// hit test asks only what is under the exact point, which a fingertip can't aim at a 6px station
// dot. MapLibreGlobe.tsx queries a padded box around the point, projects the point features it
// finds back to the screen and takes the one nearest the tap.

export interface ScreenPoint {
  x: number
  y: number
}

/** A feature and where it is drawn, in screen pixels. */
export interface ScreenCandidate<T> extends ScreenPoint {
  feature: T
}

/** How far (px) from a mouse pointer a station still counts as clicked. */
export const MOUSE_HIT_PADDING = 6
/** How far (px) from a fingertip: about half the width of a thumb pad. */
export const TOUCH_HIT_PADDING = 22

export const hitPadding = (coarsePointer: boolean): number => (coarsePointer ? TOUCH_HIT_PADDING : MOUSE_HIT_PADDING)

/** The box of `padding` px around a point, as the corner pair `queryRenderedFeatures` takes. */
export function hitBox(point: ScreenPoint, padding: number): [[number, number], [number, number]] {
  return [
    [point.x - padding, point.y - padding],
    [point.x + padding, point.y + padding],
  ]
}

/** The candidate drawn nearest to `at` (the first, on a tie), or null when there are none. */
export function nearestCandidate<T>(candidates: readonly ScreenCandidate<T>[], at: ScreenPoint): T | null {
  let best: { feature: T; distance: number } | null = null
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - at.x, candidate.y - at.y)
    if (!best || distance < best.distance) best = { feature: candidate.feature, distance }
  }
  return best?.feature ?? null
}
