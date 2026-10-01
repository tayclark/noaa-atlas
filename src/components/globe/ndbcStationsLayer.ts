// Pure helpers for the NDBC buoys layer. Kept out of MapLibreGlobe.tsx so the
// GeoJSON and popup text are unit-testable, as with coopsStationsLayer.ts.

import type { NdbcStation } from '../../data/ndbcStations'

export interface NdbcProperties {
  id: string
  name: string
}

export interface NdbcFeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: NdbcProperties; geometry: { type: 'Point'; coordinates: [number, number] } }[]
}

export function ndbcStationsToGeoJSON(stations: readonly NdbcStation[]): NdbcFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map(({ id, name, lng, lat }) => ({
      type: 'Feature',
      properties: { id, name },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    })),
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The buoy popup: its name and a link to its NDBC page, where the observations live. */
export function formatNdbcPopupHtml({ id, name }: NdbcProperties): string {
  const page = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`
  return [
    `<strong>${escapeHtml(name)}</strong>`,
    `NDBC buoy ${escapeHtml(id)}`,
    `<a href="${page}" target="_blank" rel="noreferrer">NDBC station page</a>`,
  ].join('<br/>')
}
