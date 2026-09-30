// Pure helpers for the CO-OPS tide stations layer (#51). Kept out of MapLibreGlobe.tsx so the
// GeoJSON, popup text and error messages are unit-testable, as with nwsAlertsLayer.ts.

import { CoopsHttpError, CoopsParseError } from '../../data/coopsClient'
import type { CoopsReading, CoopsResult, CoopsStation, CoopsTide } from '../../data/coopsSchema'

/** Below this zoom the ~300 stations would read as noise on the globe, so the layer stays hidden. */
export const COOPS_MIN_ZOOM = 3

export interface StationProperties {
  id: string
  name: string
  state: string
}

export interface StationFeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: StationProperties; geometry: { type: 'Point'; coordinates: [number, number] } }[]
}

export function stationsToGeoJSON(stations: readonly CoopsStation[]): StationFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map(({ id, name, state, lng, lat }) => ({
      type: 'Feature',
      properties: { id, name, state },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    })),
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stationTitle({ name, state }: Pick<StationProperties, 'name' | 'state'>): string {
  return `<strong>${escapeHtml(name)}${state ? `, ${escapeHtml(state)}` : ''}</strong>`
}

/** "2026-09-30 13:48" (UTC) → "13:48 UTC". */
function formatTime(time: string): string {
  return `${time.slice(11)} UTC`
}

function formatMetres(metres: number | null): string {
  return metres === null ? 'no value' : `${metres.toFixed(2)} m`
}

export function formatStationLoadingHtml(station: Pick<StationProperties, 'name' | 'state'>): string {
  return `${stationTitle(station)}<br/>Loading tide data…`
}

export type Fetched<T> = PromiseSettledResult<CoopsResult<T>>

/** A short message for a failed CO-OPS request, shown in a station popup. */
export function describeCoopsFetchOutcome(err: unknown): string {
  if (err instanceof CoopsHttpError) return `CO-OPS is unavailable (${err.status}).`
  if (err instanceof CoopsParseError) return 'CO-OPS returned an unexpected response.'
  return 'Could not reach CO-OPS.'
}

/** The reason a half of the popup has no data: CO-OPS's own message, or why the request failed. */
function failureMessage<T>(fetched: Fetched<T>): string {
  if (fetched.status === 'rejected') return describeCoopsFetchOutcome(fetched.reason)
  return fetched.value.ok ? '' : fetched.value.message
}

function waterLevelLine(water: Fetched<CoopsReading | null>): string {
  if (water.status === 'fulfilled' && water.value.ok) {
    const reading = water.value.value
    if (!reading) return 'Water level: no recent reading.'
    return `Water level: <strong>${formatMetres(reading.metres)}</strong> above MLLW <span style="opacity: 0.7">(${formatTime(reading.time)})</span>`
  }
  return `Water level: ${escapeHtml(failureMessage(water))}`
}

function predictionsLines(tides: Fetched<CoopsTide[]>): string {
  if (tides.status === 'fulfilled' && tides.value.ok) {
    if (tides.value.value.length === 0) return 'Predicted tides: none for today.'
    const items = tides.value.value.map(
      (t) => `<li>${t.kind === 'high' ? 'High' : 'Low'} ${formatMetres(t.metres)} at ${formatTime(t.time)}</li>`,
    )
    return `Predicted tides today (UTC):<ul style="margin: 2px 0 0; padding-left: 18px">${items.join('')}</ul>`
  }
  return `Predicted tides: ${escapeHtml(failureMessage(tides))}`
}

/** The station popup once both requests have settled. Each half fails independently. */
export function formatStationPopupHtml(
  station: Pick<StationProperties, 'name' | 'state'>,
  water: Fetched<CoopsReading | null>,
  tides: Fetched<CoopsTide[]>,
): string {
  return `${stationTitle(station)}<br/>${waterLevelLine(water)}<br/>${predictionsLines(tides)}${PRELIMINARY_NOTE}`
}

// CO-OPS's disclaimer: raw data hasn't had National Ocean Service quality control (see the README's
// data terms).
const PRELIMINARY_NOTE = '<br/><span style="opacity: 0.7">Preliminary data, not quality-controlled.</span>'
