import { describe, expect, it } from 'vitest'
import type { GraphEdge } from '../../data/graphSchema'
import { createGraphSimulation, EDGE_CLASS, EDGE_TYPE_LABELS, nodeRadius, type SimEdge, type SimNode } from './graphLayout'

const serviceNode = (id: string): SimNode => ({
  id,
  kind: 'service',
  name: id,
  summary: '',
  owner: { office: 'NWS', program: '' },
  theme: 'weather',
  baseUrl: 'https://example.com',
  formats: ['json'],
  auth: { type: 'none' },
  coverage: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  freshness: { cadence: 'realtime' },
  docUrl: 'https://example.com/docs',
  lastVerified: '2026-01-01',
  liveLayer: true,
  tags: [],
})

const themeNode = (id: string): SimNode => ({ id, kind: 'theme', name: id, theme: 'weather' })

const themeEdge = (source: string, target: string): SimEdge => ({
  source,
  target,
  type: 'theme',
  label: 'Weather & forecast',
})

describe('nodeRadius', () => {
  it('renders theme hubs larger than service nodes', () => {
    expect(nodeRadius(themeNode('theme-weather'))).toBeGreaterThan(nodeRadius(serviceNode('nws-api')))
  })
})

const EDGE_TYPES: GraphEdge['type'][] = ['theme', 'shared-id', 'data-flow']

describe('EDGE_CLASS', () => {
  it('has a distinct class name for every edge type', () => {
    const classes = EDGE_TYPES.map((type) => EDGE_CLASS[type])
    expect(classes.every((className) => typeof className === 'string' && className.length > 0)).toBe(true)
    expect(new Set(classes).size).toBe(EDGE_TYPES.length)
  })
})

describe('EDGE_TYPE_LABELS', () => {
  it('has a label for every edge type', () => {
    for (const type of EDGE_TYPES) {
      expect(EDGE_TYPE_LABELS[type]).toBeTruthy()
    }
  })
})

describe('createGraphSimulation', () => {
  it('registers a node per input node and resolves link ids to node references', () => {
    const nodes = [themeNode('theme-weather'), serviceNode('nws-api')]
    const edges = [themeEdge('nws-api', 'theme-weather')]
    const simulation = createGraphSimulation(nodes, edges, 400, 300)

    expect(simulation.nodes()).toHaveLength(2)
    expect(simulation.force('link')).toBeDefined()
    expect(simulation.force('charge')).toBeDefined()
    expect(simulation.force('center')).toBeDefined()
    expect(simulation.force('collide')).toBeDefined()

    simulation.tick()
    const link = simulation.force<import('d3-force').ForceLink<SimNode, SimEdge>>('link')
    const [resolved] = link?.links() ?? []
    expect(typeof resolved?.source).toBe('object')
    expect((resolved?.source as SimNode | undefined)?.id).toBe('nws-api')
    expect((resolved?.target as SimNode | undefined)?.id).toBe('theme-weather')

    simulation.stop()
  })

  it('builds an empty simulation for an empty graph without throwing', () => {
    const simulation = createGraphSimulation([], [], 400, 300)
    expect(simulation.nodes()).toHaveLength(0)
    simulation.stop()
  })
})
