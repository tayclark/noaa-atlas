// Pure helpers for the SPC Day 1 convective outlook layer (#245). Kept out of MapLibreGlobe.tsx so
// the legend, popup text and error wording are unit-testable. Polygon colours come from the feed's
// own `fill` and `stroke` properties; the legend repeats them for the six categories.

import { describeClientError } from '../../data/clientErrors'
import { spcErrors } from '../../data/spcClient'
import type { SpcOutlook } from '../../data/spcSchema'
import type { LayerGroup } from './mapLayers'
import { escapeHtml } from './popupHtml'

export const SPC_SOURCE_ID = 'spc-outlook'
export const SPC_FILL_LAYER_ID = 'spc-outlook-fill'
export const SPC_LINE_LAYER_ID = 'spc-outlook-line'
export const SPC_LAYER_IDS = [SPC_FILL_LAYER_ID, SPC_LINE_LAYER_ID]

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

export const SPC_ATTRIBUTION =
  'Outlook: <a href="https://www.spc.noaa.gov/">NOAA/NWS Storm Prediction Center</a>'

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
  return describeClientError(err, spcErrors, {
    http: 'SPC service is unavailable, the outlook could not be loaded.',
    parse: 'SPC returned an unexpected outlook response.',
    network: 'Could not reach SPC, the outlook could not be loaded.',
    fallback: 'Something went wrong loading the outlook.',
  })
}

/** The outlook polygons, empty and hidden until the SPC node is selected. */
export function spcOutlookLayers(): LayerGroup {
  return {
    sourceId: SPC_SOURCE_ID,
    source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: SPC_ATTRIBUTION },
    layers: [
      {
        id: SPC_FILL_LAYER_ID,
        type: 'fill',
        source: SPC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': SPC_FILL_OPACITY },
      },
      {
        id: SPC_LINE_LAYER_ID,
        type: 'line',
        source: SPC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.5 },
      },
    ],
  }
}
