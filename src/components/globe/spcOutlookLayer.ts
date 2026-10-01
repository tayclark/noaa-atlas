// Pure helpers for the SPC Day 1 convective outlook layer (#245). Kept out of MapLibreGlobe.tsx so
// the legend, popup text and error wording are unit-testable. Polygon colours come from the feed's
// own `fill` and `stroke` properties; the legend repeats them for the six categories.

import { SpcHttpError, SpcParseError } from '../../data/spcClient'
import type { SpcOutlook } from '../../data/spcSchema'

export interface SpcCategory {
  label: string
  name: string
  color: string
}

/** The six categorical risks, lowest to highest, with SPC's published fill colours. */
export const SPC_CATEGORIES: readonly SpcCategory[] = [
  { label: 'TSTM', name: 'General thunderstorms', color: '#C1E9C1' },
  { label: 'MRGL', name: 'Marginal', color: '#7DC57D' },
  { label: 'SLGT', name: 'Slight', color: '#F6F67B' },
  { label: 'ENH', name: 'Enhanced', color: '#E6C27D' },
  { label: 'MDT', name: 'Moderate', color: '#E67D7D' },
  { label: 'HIGH', name: 'High', color: '#FF7DFF' },
]

export const SPC_FILL_OPACITY = 0.45

/** The categories present in an outlook, lowest risk first, for a legend that matches the map. */
export function categoriesInOutlook(outlook: SpcOutlook): SpcCategory[] {
  const present = new Set(outlook.features.map((f) => f.properties.LABEL))
  return SPC_CATEGORIES.filter((c) => present.has(c.label))
}

/** True when the outlook has nothing to draw, which is a valid answer rather than an error. */
export function isOutlookEmpty(outlook: SpcOutlook): boolean {
  return outlook.features.length === 0
}

export interface OutlookPopupContent {
  title: string
  valid: string
  expires: string
  forecaster: string | null
}

/** Formats a polygon's properties for the click popup: category, validity window and forecaster. */
export function describeOutlookForPopup(properties: SpcOutlook['features'][number]['properties']): OutlookPopupContent {
  return {
    title: properties.LABEL2,
    valid: new Date(properties.VALID_ISO).toLocaleString(),
    expires: new Date(properties.EXPIRE_ISO).toLocaleString(),
    forecaster: properties.FORECASTER ?? null,
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function formatOutlookPopupHtml(properties: SpcOutlook['features'][number]['properties']): string {
  const { title, valid, expires, forecaster } = describeOutlookForPopup(properties)
  return [
    `<strong>${escapeHtml(title)}</strong>`,
    `Valid ${escapeHtml(valid)}`,
    `Until ${escapeHtml(expires)}`,
    ...(forecaster ? [`Forecaster: ${escapeHtml(forecaster)}`] : []),
  ].join('<br/>')
}

/** A human-readable message for a failed outlook fetch, by error kind. */
export function describeSpcFetchOutcome(err: unknown): string {
  if (err instanceof SpcHttpError) return 'SPC service is unavailable, the outlook could not be loaded.'
  if (err instanceof SpcParseError) return 'SPC returned an unexpected outlook response.'
  if (err instanceof TypeError) return 'Could not reach SPC, the outlook could not be loaded.'
  return 'Something went wrong loading the outlook.'
}
