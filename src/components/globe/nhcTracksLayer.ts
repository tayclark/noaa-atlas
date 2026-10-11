// The NHC storm tracks' layers (#334): every active storm's cone, observed and forecast track, with a
// trail and marker the play control moves along the chosen storm. One GeoJSON source whose features
// carry a `kind` (stormTrack.ts builds them); each layer draws one kind. Empty and hidden until the
// NHC node is selected.

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { LayerGroup } from './mapLayers'

export const NHC_SOURCE_ID = 'nhc-tracks'
export const NHC_CONE_FILL_LAYER_ID = 'nhc-tracks-cone-fill'
export const NHC_CONE_LINE_LAYER_ID = 'nhc-tracks-cone-line'
export const NHC_PAST_LAYER_ID = 'nhc-tracks-past'
export const NHC_FORECAST_LAYER_ID = 'nhc-tracks-forecast'
export const NHC_TRAIL_CASING_LAYER_ID = 'nhc-tracks-trail-casing'
export const NHC_TRAIL_LAYER_ID = 'nhc-tracks-trail'
export const NHC_FIX_LAYER_ID = 'nhc-tracks-fix'
export const NHC_MARKER_LAYER_ID = 'nhc-tracks-marker'

/** Every track layer, bottom first. */
export const NHC_LAYER_IDS = [
  NHC_CONE_FILL_LAYER_ID,
  NHC_CONE_LINE_LAYER_ID,
  NHC_PAST_LAYER_ID,
  NHC_FORECAST_LAYER_ID,
  NHC_TRAIL_CASING_LAYER_ID,
  NHC_TRAIL_LAYER_ID,
  NHC_FIX_LAYER_ID,
  NHC_MARKER_LAYER_ID,
]

/** Filters the source to one kind of feature. */
export const nhcKind = (kind: string): ExpressionSpecification => ['==', ['get', 'kind'], kind]
/** The chosen storm at full strength, the others faded. */
export const nhcSelected = (selected: number, other: number): ExpressionSpecification => ['case', ['get', 'selected'], selected, other]

export function nhcTrackLayers(): LayerGroup {
  const layout = { visibility: 'none' as const }
  return {
    sourceId: NHC_SOURCE_ID,
    source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    layers: [
      {
        id: NHC_CONE_FILL_LAYER_ID,
        type: 'fill',
        source: NHC_SOURCE_ID,
        filter: nhcKind('cone'),
        layout,
        paint: { 'fill-color': '#ffffff', 'fill-opacity': nhcSelected(0.22, 0.08) },
      },
      {
        id: NHC_CONE_LINE_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('cone'),
        layout,
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': nhcSelected(0.8, 0.3) },
      },
      {
        id: NHC_PAST_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('past'),
        layout: { ...layout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': nhcSelected(0.6, 0.35) },
      },
      {
        id: NHC_FORECAST_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('forecast'),
        layout: { ...layout, 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': nhcSelected(0.6, 0.35) },
      },
      // A dark casing keeps the white trail readable over white cloud tops.
      {
        id: NHC_TRAIL_CASING_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('trail'),
        layout: { ...layout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111827', 'line-width': 6, 'line-opacity': 0.8 },
      },
      {
        id: NHC_TRAIL_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('trail'),
        layout: { ...layout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 3 },
      },
      {
        id: NHC_FIX_LAYER_ID,
        type: 'circle',
        source: NHC_SOURCE_ID,
        filter: nhcKind('fix'),
        layout,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': nhcSelected(4, 3),
          'circle-opacity': nhcSelected(1, 0.5),
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': nhcSelected(1, 0.5),
        },
      },
      {
        id: NHC_MARKER_LAYER_ID,
        type: 'circle',
        source: NHC_SOURCE_ID,
        filter: nhcKind('marker'),
        layout,
        // A ring, not a dot, so the eye on the satellite image shows through it.
        paint: { 'circle-opacity': 0, 'circle-radius': 11, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 },
      },
    ],
  }
}
