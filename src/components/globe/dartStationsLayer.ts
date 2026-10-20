// Pure helpers for the DART tsunami buoys layer (#80). Kept out of MapLibreGlobe.tsx so the
// GeoJSON and popup text are unit-testable, as with coopsStationsLayer.ts.

import type { DartStation } from '../../data/dartStations'
import type { LayerGroup } from './mapLayers'
import { escapeHtml } from './popupHtml'

export const DART_SOURCE_ID = 'dart-stations'
export const DART_LAYER_ID = 'dart-stations-circle'

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

/** The buoy popup: its name and a link to its NDBC page, where the height series lives. */
export function formatDartPopupHtml({ id, name }: DartProperties): string {
  const page = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(id)}`
  return [
    `<strong>${escapeHtml(name)}</strong>`,
    `DART buoy ${escapeHtml(id)}`,
    `<a href="${page}" target="_blank" rel="noreferrer">NDBC station page</a>`,
  ].join('<br/>')
}

export const DART_ATTRIBUTION =
  'Buoys: <a href="https://www.ndbc.noaa.gov/dart.shtml">NOAA/NDBC DART</a>'

/** The buoy dots, empty and hidden until the DART node is selected and the list has loaded. */
export function dartStationLayers(): LayerGroup {
  return {
    sourceId: DART_SOURCE_ID,
    source: { type: 'geojson', data: dartStationsToGeoJSON([]), attribution: DART_ATTRIBUTION },
    layers: [
      {
        id: DART_LAYER_ID,
        type: 'circle',
        source: DART_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#c2410c',
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
    ],
  }
}
