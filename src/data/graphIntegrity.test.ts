import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'

/** A node not re-verified within this many months is flagged as stale. */
const MAX_AGE_MONTHS = 18

const graph = parseGraphFile(graphJson)

describe('graph.json integrity', () => {
  it('has unique node ids', () => {
    const ids = graph.nodes.map((n) => n.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('gives every node a docUrl and a lastVerified date that is not in the future', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(graph.nodes.filter((n) => !n.docUrl || !n.lastVerified).map((n) => n.id)).toEqual([])
    expect(graph.nodes.filter((n) => n.lastVerified > today).map((n) => n.id)).toEqual([])
  })

  it(`has no node last verified more than ${MAX_AGE_MONTHS} months ago`, () => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - MAX_AGE_MONTHS)
    const cutoffDate = cutoff.toISOString().slice(0, 10)
    expect(graph.nodes.filter((n) => n.lastVerified < cutoffDate).map((n) => `${n.id} (${n.lastVerified})`)).toEqual([])
  })

  it('gives every edge a type and a sourceUrl, and links only known nodes', () => {
    const ids = new Set(graph.nodes.map((n) => n.id))
    const label = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`
    expect(graph.edges.filter((e) => !['shared-id', 'data-flow'].includes(e.type)).map(label)).toEqual([])
    expect(graph.edges.filter((e) => !e.sourceUrl).map(label)).toEqual([])
    expect(graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target)).map(label)).toEqual([])
  })
})
