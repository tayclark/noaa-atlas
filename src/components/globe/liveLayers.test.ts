import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import { parseGraphFile } from '../../data/graphSchema'
import { LIVE_LAYERS } from './liveLayers'

describe('LIVE_LAYERS', () => {
  it('names a globe layer for exactly the services graph.json marks live', () => {
    const live = parseGraphFile(graphJson)
      .nodes.filter((node) => node.liveLayer)
      .map((node) => node.id)
    expect(Object.keys(LIVE_LAYERS).sort()).toEqual(live.sort())
  })
})
