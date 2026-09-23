import { describe, expect, it } from 'vitest'
import { serviceNodeSchema, type ServiceNode } from '../../data/graphSchema'
import { makeNode } from '../../data/graphFixtures'
import { describeCoverageForPopup, formatCoveragePopupHtml } from './coveragePopup'

const parseNode = (overrides: Record<string, unknown> = {}): ServiceNode => serviceNodeSchema.parse(makeNode(overrides))

describe('describeCoverageForPopup', () => {
  it('labels a live-layer node as "live"', () => {
    const node = parseNode({ liveLayer: true })
    expect(describeCoverageForPopup([node])).toEqual([{ name: 'NWS API', status: 'live', notLiveReason: undefined }])
  })

  it('labels a non-live node as "available, not live yet" and carries the reason', () => {
    const node = parseNode({ liveLayer: false, notLiveReason: 'Deferred to a later layer.' })
    expect(describeCoverageForPopup([node])).toEqual([
      { name: 'NWS API', status: 'available, not live yet', notLiveReason: 'Deferred to a later layer.' },
    ])
  })

  it('returns an empty list for no covering nodes', () => {
    expect(describeCoverageForPopup([])).toEqual([])
  })
})

describe('formatCoveragePopupHtml', () => {
  it('renders a fallback message when no nodes cover the point', () => {
    expect(formatCoveragePopupHtml([])).toContain('No APIs cover this location')
  })

  it('renders each entry with its name and status', () => {
    const html = formatCoveragePopupHtml([
      { name: 'NWS API', status: 'live' },
      { name: 'SPC GIS Data Feeds', status: 'available, not live yet', notLiveReason: 'Deferred for now.' },
    ])
    expect(html).toContain('NWS API')
    expect(html).toContain('live')
    expect(html).toContain('SPC GIS Data Feeds')
    expect(html).toContain('available, not live yet')
    expect(html).toContain('Deferred for now.')
  })
})
