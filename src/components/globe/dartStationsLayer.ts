// Pure helpers for the DART tsunami buoys layer (#80). Kept out of MapLibreGlobe.tsx so the
// GeoJSON and popup text are unit-testable, as with coopsStationsLayer.ts.

import type { DartStation } from '../../data/dartStations'

export interface DartProperties {
  id: string
  name: string
}

export interface DartFeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: DartProperties; geometry: { type: 'Point'; coordinates: [number, number] } }[]
}

export function dartStationsToGeoJSON(stations: readonly DartStation[]): DartFeatureCollection {
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

/** The buoy popup: its name and a link to its NDBC page, where the height series lives. */
export function formatDartPopupHtml({ id, name }: DartProperties): string {
  const page = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`
  return [
    `<strong>${escapeHtml(name)}</strong>`,
    `DART buoy ${escapeHtml(id)}`,
    `<a href="${page}" target="_blank" rel="noreferrer">NDBC station page</a>`,
  ].join('<br/>')
}
