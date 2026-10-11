// The selection's coverage footprint on the globe (#149): each service's area in its theme colour,
// drawn at the bottom, under every live layer. It starts empty; the selection fills it.

import type { LayerGroup } from './mapLayers'

export const COVERAGE_SOURCE_ID = 'selected-coverage'
export const COVERAGE_FILL_LAYER_ID = 'selected-coverage-fill'
export const COVERAGE_LINE_LAYER_ID = 'selected-coverage-line'

// The US outlines are derived from Natural Earth (public domain) and the Marine Regions EEZ, and the
// ocean basins from Marine Regions' Global Oceans and Seas; their CC BY 4.0 licence asks for credit
// wherever they're shown (#163, #170).
export const COVERAGE_ATTRIBUTION =
  'Coverage: <a href="https://www.naturalearthdata.com/">Natural Earth</a>, <a href="https://www.marineregions.org/">Marine Regions</a> (CC BY 4.0)'

export function coverageLayers(): LayerGroup {
  return {
    sourceId: COVERAGE_SOURCE_ID,
    source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: COVERAGE_ATTRIBUTION },
    layers: [
      {
        id: COVERAGE_FILL_LAYER_ID,
        type: 'fill',
        source: COVERAGE_SOURCE_ID,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 },
      },
      {
        id: COVERAGE_LINE_LAYER_ID,
        type: 'line',
        source: COVERAGE_SOURCE_ID,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
      },
    ],
  }
}
