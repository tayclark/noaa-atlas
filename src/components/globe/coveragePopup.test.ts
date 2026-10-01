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

  it('lists the live services by name, marked live', () => {
    const html = formatCoveragePopupHtml([
      { name: 'NWS API', status: 'live' },
      { name: 'SWPC Kp', status: 'live' },
    ])
    expect(html).toContain('APIs covering this point')
    expect(html).toContain('<li><strong>NWS API</strong> — live</li>')
    expect(html).toContain('<li><strong>SWPC Kp</strong> — live</li>')
    expect(html).not.toContain('<details')
  })

  it('folds the services that are not live yet into one line, without their reasons (#78)', () => {
    const html = formatCoveragePopupHtml([
      { name: 'NWS API', status: 'live' },
      { name: 'SPC GIS Data Feeds', status: 'available, not live yet', notLiveReason: 'Deferred for now.' },
      { name: 'WPC GIS Products', status: 'available, not live yet', notLiveReason: 'Deferred as well.' },
    ])
    expect(html).toContain('<summary>2 more available, not live yet</summary>')
    expect(html).toContain('<li>SPC GIS Data Feeds</li>')
    expect(html).toContain('<li>WPC GIS Products</li>')
    expect(html).not.toContain('Deferred')
    // Folded: it opens only when asked to.
    expect(html).not.toContain('<details open')
  })

  it('says how many are available when none is live', () => {
    const html = formatCoveragePopupHtml([
      { name: 'SPC GIS Data Feeds', status: 'available, not live yet' },
      { name: 'WPC GIS Products', status: 'available, not live yet' },
    ])
    expect(html).toContain('<summary>2 available, not live yet</summary>')
    expect(html).not.toContain('coverage-live')
  })

  it('escapes a name that has markup in it', () => {
    expect(formatCoveragePopupHtml([{ name: 'A & <B>', status: 'live' }])).toContain('A &amp; &lt;B&gt;')
  })
})
