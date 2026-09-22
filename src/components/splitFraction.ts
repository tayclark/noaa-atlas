export const MIN_FRACTION = 0.25
export const MAX_FRACTION = 0.75

export function clampFraction(value: number): number {
  return Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, value))
}
