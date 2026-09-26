import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile, THEMES, type GraphEdge, type ServiceNode, type ThemeNode } from '../../data/graphSchema'
import {
  computeFitTransform,
  computeLabelledFitTransform,
  computePathFitTransform,
  createGraphSimulation,
  EDGE_CLASS,
  EDGE_TYPE_LABELS,
  largestLinkedGroup,
  nodeRadius,
  RING_ORDER,
  themeAnchors,
  type SimEdge,
  type SimNode,
} from './graphLayout'

describe('themeAnchors', () => {
  it('gives every theme a distinct anchor inside the canvas', () => {
    const anchors = themeAnchors(THEMES, 700, 470)
    expect(anchors.size).toBe(THEMES.length)
    const keys = new Set([...anchors.values()].map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`))
    expect(keys.size).toBe(THEMES.length)
    for (const { x, y } of anchors.values()) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(700)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(470)
    }
  })

  it('places every theme on the ring exactly once', () => {
    expect([...RING_ORDER].sort()).toEqual([...THEMES].sort())
  })
})

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

  it('clusters shipped services closer to their own theme hub than to any other hub', () => {
    const graph = buildGraph(parseGraphFile(graphJson))
    // A direct edge to another theme's service legitimately pulls a node toward that cluster.
    const themeOf = new Map(graph.nodes.map((node) => [node.id, node.kind === 'root' ? null : node.theme]))
    const bridging = new Set(
      graph.edges
        .filter((edge) => edge.type !== 'theme' && edge.type !== 'root' && themeOf.get(edge.source) !== themeOf.get(edge.target))
        .flatMap((edge) => [edge.source, edge.target]),
    )
    const nodes: SimNode[] = graph.nodes.map((node) => ({ ...node }))
    const simulation = createGraphSimulation(nodes, graph.edges.map((edge) => ({ ...edge })), 700, 470)
    simulation.stop().tick(300)

    const hubs = nodes.filter((node): node is SimNode & ThemeNode => node.kind === 'theme')
    const dist = (a: SimNode, b: SimNode) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0))
    const misplaced = nodes
      .filter((node): node is SimNode & ServiceNode => node.kind === 'service' && !bridging.has(node.id))
      .filter((node) => {
        const own = hubs.find((hub) => hub.theme === node.theme) as SimNode
        return hubs.some((hub) => hub !== own && dist(node, hub) < dist(node, own))
      })
    expect(misplaced.map((node) => node.id)).toEqual([])
  })

  it('builds an empty simulation for an empty graph without throwing', () => {
    const simulation = createGraphSimulation([], [], 400, 300)
    expect(simulation.nodes()).toHaveLength(0)
    simulation.stop()
  })
})

describe('computeFitTransform', () => {
  it('returns null for no positions', () => {
    expect(computeFitTransform([], 800, 600)).toBeNull()
  })

  it('centers a single position in the viewport without blowing up scale', () => {
    const fit = computeFitTransform([{ x: 100, y: 100 }], 800, 600)
    expect(fit).not.toBeNull()
    expect(fit?.k).toBeLessThanOrEqual(2)
    expect(fit?.k).toBeGreaterThan(0)
    // x/y should place (100,100) at the viewport center once scaled: x + k*100 ≈ width/2
    expect((fit?.x ?? 0) + (fit?.k ?? 0) * 100).toBeCloseTo(400, 0)
    expect((fit?.y ?? 0) + (fit?.k ?? 0) * 100).toBeCloseTo(300, 0)
  })

  it('centers the bounding box of scattered positions', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ]
    const fit = computeFitTransform(positions, 800, 600)
    expect(fit).not.toBeNull()
    const centerX = (fit?.x ?? 0) + (fit?.k ?? 0) * 100
    const centerY = (fit?.y ?? 0) + (fit?.k ?? 0) * 50
    expect(centerX).toBeCloseTo(400, 0)
    expect(centerY).toBeCloseTo(300, 0)
  })

  it('clamps scale to the given maxScale for a tightly clustered bounding box', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    const fit = computeFitTransform(positions, 800, 600, 60, 1.5)
    expect(fit?.k).toBe(1.5)
  })

  it('centers a single position in the area right of a left inset (#141)', () => {
    const fit = computeFitTransform([{ x: 100, y: 100 }], 800, 600, 60, 2, { left: 300, top: 0, right: 0, bottom: 0 })
    expect((fit?.x ?? 0) + (fit?.k ?? 0) * 100).toBeCloseTo(550, 0)
    expect((fit?.y ?? 0) + (fit?.k ?? 0) * 100).toBeCloseTo(300, 0)
  })

  it('fits the bounding box inside the inset area (#141)', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 400, y: 100 },
    ]
    const inset = { left: 0, top: 200, right: 0, bottom: 0 }
    const fit = computeFitTransform(positions, 800, 600, 60, 4, inset)
    const k = fit?.k ?? 0
    // Scale is limited by the 800 - 2*60 = 680px available width, and the box centre sits in
    // the middle of the 400px-tall area below the inset.
    expect(k).toBeCloseTo(680 / 400)
    expect((fit?.y ?? 0) + k * 50).toBeCloseTo(400, 0)
    expect(fit?.y ?? 0).toBeGreaterThanOrEqual(200) // the box's top edge (y = 0) lands below the inset
  })
})

describe('computeLabelledFitTransform', () => {
  const inset = { left: 0, top: 0, right: 0, bottom: 0 }

  it('returns null for no positions', () => {
    expect(computeLabelledFitTransform([], 800, 600, 60, 1.25, inset, 4)).toBeNull()
  })

  it('keeps every label end inside the viewport, where framing node centres alone would not (#18)', () => {
    const items = [
      { x: 0, y: 0, radius: 8, labelWidth: 20 },
      { x: 200, y: 0, radius: 8, labelWidth: 150 },
    ]
    const labelRight = (fit: { x: number; k: number }) => fit.x + fit.k * (200 + 8) + 4 + 150

    const centresOnly = computeFitTransform(items, 400, 300, 60, 1.25, inset)
    if (!centresOnly) throw new Error('expected a fit')
    expect(labelRight(centresOnly)).toBeGreaterThan(400)

    const fit = computeLabelledFitTransform(items, 400, 300, 60, 1.25, inset, 4)
    if (!fit) throw new Error('expected a fit')
    expect(labelRight(fit)).toBeLessThanOrEqual(400)
    expect(fit.x).toBeGreaterThanOrEqual(0) // the leftmost node is still in view
  })
})

describe('largestLinkedGroup', () => {
  it('chains positions within the link distance into one group', () => {
    const items = [
      { id: 'far', x: 0, y: 0 },
      { id: 'a', x: 500, y: 0 },
      { id: 'b', x: 600, y: 0 },
      { id: 'c', x: 700, y: 0 }, // 200 from a, but linked through b
    ]
    expect(largestLinkedGroup(items, 150).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a tie in favour of the group holding the earliest item', () => {
    const items = [
      { id: 'primary', x: 0, y: 0 },
      { id: 'other', x: 500, y: 0 },
      { id: 'primary-2', x: 50, y: 0 },
      { id: 'other-2', x: 550, y: 0 },
    ]
    expect(largestLinkedGroup(items, 100).map((item) => item.id)).toEqual(['primary', 'primary-2'])
  })

  it('returns nothing for no items', () => {
    expect(largestLinkedGroup([], 100)).toEqual([])
  })
})

describe('computePathFitTransform', () => {
  const inset = { left: 0, top: 0, right: 0, bottom: 0 }
  const step = (x: number, y: number) => ({ x, y, radius: 6, labelWidth: 40 })
  const fit = (items: ReturnType<typeof step>[]) => computePathFitTransform(items, 640, 352, 60, 1.25, inset, 4, 0.8, 150)

  it('fits the whole path when it is readable', () => {
    const items = [step(0, 0), step(100, 50)]
    expect(fit(items)).toEqual(computeLabelledFitTransform(items, 640, 352, 60, 1.25, inset, 4))
  })

  it('frames the largest group of steps when the whole path would be too small to read (#162)', () => {
    const outlier = step(0, -600)
    const cluster = [step(0, 0), step(40, 10), step(80, 0), step(40, 40)]
    const whole = computeLabelledFitTransform([outlier, ...cluster], 640, 352, 60, 1.25, inset, 4)
    if (!whole) throw new Error('expected a fit')
    expect(whole.k).toBeLessThan(0.8)

    expect(fit([outlier, ...cluster])).toEqual(computeLabelledFitTransform(cluster, 640, 352, 60, 1.25, inset, 4))
  })

  it('keeps the whole-path fit when no two steps are close', () => {
    const items = [step(0, -600), step(0, 600)]
    expect(fit(items)).toEqual(computeLabelledFitTransform(items, 640, 352, 60, 1.25, inset, 4))
  })
})
