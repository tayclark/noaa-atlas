// Pure helpers for the NDBC buoys layer. Kept out of MapLibreGlobe.tsx so the
// GeoJSON and popup text are unit-testable, as with coopsStationsLayer.ts.

import type { NdbcStation } from '../../data/ndbcStations'
import type { LayerGroup } from './mapLayers'
import { escapeHtml } from './popupHtml'

export const NDBC_SOURCE_ID = 'ndbc-stations'
export const NDBC_LAYER_ID = 'ndbc-stations-circle'

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

/** The buoy popup: its name and a link to its NDBC page, where the observations live. */
export function formatNdbcPopupHtml({ id, name }: NdbcProperties): string {
  const page = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`
  return [
    `<strong>${escapeHtml(name)}</strong>`,
    `NDBC buoy ${escapeHtml(id)}`,
    `<a href="${page}" target="_blank" rel="noreferrer">NDBC station page</a>`,
  ].join('<br/>')
}

/** The buoy dots, empty and hidden until the NDBC node is selected and the list has loaded. */
export function ndbcStationLayers(): LayerGroup {
  return {
    sourceId: NDBC_SOURCE_ID,
    source: { type: 'geojson', data: ndbcStationsToGeoJSON([]) },
    layers: [
      {
        id: NDBC_LAYER_ID,
        type: 'circle',
        source: NDBC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#0f766e',
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      },
    ],
  }
}
