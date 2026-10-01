import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import { parseGraphFile, type ServiceNode } from '../../data/graphSchema'
import { buildCompareRows } from './compareRows'
import { formatAuth, formatFreshness } from './nodeDetailFormat'

const services = parseGraphFile(graphJson).nodes.filter((n): n is ServiceNode => n.kind === 'service')

describe('buildCompareRows', () => {
  it('returns one row per field with one cell per node, in order', () => {
    const [a, b] = services as [ServiceNode, ServiceNode]
    const rows = buildCompareRows([a, b])
    expect(rows.map((r) => r.label)).toEqual(['Auth', 'Formats', 'Coverage', 'Freshness', 'Rate limits', 'Owner'])
    for (const row of rows) expect(row.cells).toHaveLength(2)
    expect(rows[0]!.cells).toEqual([formatAuth(a.auth), formatAuth(b.auth)])
    expect(rows[3]!.cells).toEqual([formatFreshness(a.freshness), formatFreshness(b.freshness)])
  })

  it('has no cells for no nodes', () => {
    expect(buildCompareRows([]).every((r) => r.cells.length === 0)).toBe(true)
  })
})
