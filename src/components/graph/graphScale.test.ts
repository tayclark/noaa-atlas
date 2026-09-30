import { describe, expect, it } from 'vitest'
import { createGraphSimulation, RING_ORDER, type SimEdge, type SimNode } from './graphLayout'
import { placeLabels } from './labelPlacement'

// Scale check for #86: the real graph has ~40 nodes, so this builds a synthetic one 25x larger. The
// limits are about 100x the times measured on a laptop (a tick was 2.5 ms and a label pass 2 ms at
// 1000 nodes), so they only catch an accidental blow-up such as a quadratic-per-tick regression.
const NODE_COUNT = 1000

function syntheticGraph(count: number) {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    kind: 'service',
    name: `Node ${i}`,
    theme: RING_ORDER[i % RING_ORDER.length],
  })) as unknown as SimNode[]
  const edges = Array.from({ length: count * 2 }, (_, i) => ({
    source: `n${i % count}`,
    target: `n${(i * 7 + 3) % count}`,
    type: 'shared-id',
  })) as unknown as SimEdge[]
  return { nodes, edges }
}

describe('graph layout at scale', () => {
  it('ticks the simulation and places labels for 1000 nodes within budget', () => {
    const { nodes, edges } = syntheticGraph(NODE_COUNT)
    const simulation = createGraphSimulation(nodes, edges, 1200, 700)
    simulation.stop()

    const tickStart = performance.now()
    for (let i = 0; i < 50; i++) simulation.tick()
    const tickMs = (performance.now() - tickStart) / 50

    const items = nodes.map((node, i) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: 6,
      width: 80,
      height: 13,
      priority: i % 5,
    }))
    const placeStart = performance.now()
    const placed = placeLabels(items, { width: 1200, height: 700 })
    const placeMs = performance.now() - placeStart

    expect(placed.size).toBe(NODE_COUNT)
    expect(tickMs).toBeLessThan(250)
    expect(placeMs).toBeLessThan(250)
  })
})
