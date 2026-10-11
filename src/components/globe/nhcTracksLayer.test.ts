import { describe, expect, it } from 'vitest'
import type { LayerGroup } from './mapLayers'
import { NHC_LAYER_IDS, nhcKind, nhcSelected, nhcTrackLayers } from './nhcTracksLayer'

const layerIds = (group: LayerGroup) => group.layers.map((layer) => layer.id)
const visibility = (group: LayerGroup) => group.layers.map((layer) => ('layout' in layer ? layer.layout?.visibility : undefined))
const sources = (group: LayerGroup) => new Set(group.layers.map((layer) => ('source' in layer ? layer.source : undefined)))

describe('nhcTrackLayers', () => {
  it('draws each kind of track feature in its own hidden layer, bottom first', () => {
    const group = nhcTrackLayers()
    expect(group.source).toEqual({ type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    expect(layerIds(group)).toEqual(NHC_LAYER_IDS)
    expect(sources(group)).toEqual(new Set([group.sourceId]))
    expect(new Set(visibility(group))).toEqual(new Set(['none']))
    expect(group.layers.map((layer) => ('filter' in layer ? layer.filter : undefined))).toEqual(
      ['cone', 'cone', 'past', 'forecast', 'trail', 'trail', 'fix', 'marker'].map(nhcKind),
    )
  })

  it('builds the kind filter and the chosen-storm emphasis', () => {
    expect(nhcKind('cone')).toEqual(['==', ['get', 'kind'], 'cone'])
    expect(nhcSelected(1, 0.5)).toEqual(['case', ['get', 'selected'], 1, 0.5])
  })
})
