import { describe, expect, it } from 'vitest'
import { COVERAGE_ATTRIBUTION, coverageLayers } from './coverageLayer'
import type { LayerGroup } from './mapLayers'

const layerIds = (group: LayerGroup) => group.layers.map((layer) => layer.id)
const visibility = (group: LayerGroup) => group.layers.map((layer) => ('layout' in layer ? layer.layout?.visibility : undefined))
const sources = (group: LayerGroup) => new Set(group.layers.map((layer) => ('source' in layer ? layer.source : undefined)))

describe('coverageLayers', () => {
  it('is an empty, credited footprint drawn as a fill under its outline', () => {
    const group = coverageLayers()
    expect(group.source).toEqual({ type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: COVERAGE_ATTRIBUTION })
    expect(layerIds(group)).toEqual(['selected-coverage-fill', 'selected-coverage-line'])
    expect(sources(group)).toEqual(new Set([group.sourceId]))
    expect(visibility(group)).toEqual([undefined, undefined])
  })
})
