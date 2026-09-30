// The user's "reduce motion" OS setting (#47), read on demand by the imperative code (map camera,
// graph layout) that CSS can't reach. Where there is no matchMedia (jsdom) motion stays on.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}
