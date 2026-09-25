import { describe, expect, it } from 'vitest'
import { parseKp1m } from '../../data/swpcSchema'
import { makeKp1m } from '../../data/swpcFixtures'
import { describeKp, gScaleFor } from './kpReadout'

describe('gScaleFor', () => {
  it.each([
    [0, 'G0', 'Quiet'],
    [3, 'G0', 'Quiet'],
    [4, 'G0', 'Active'],
    [5, 'G1', 'Minor storm'],
    [6, 'G2', 'Moderate storm'],
    [7, 'G3', 'Strong storm'],
    [8, 'G4', 'Severe storm'],
    [9, 'G5', 'Extreme storm'],
  ] as const)('maps Kp %i to %s (%s)', (kp, gScale, label) => {
    expect(gScaleFor(kp)).toEqual({ gScale, label })
  })
})

describe('describeKp', () => {
  it('reads the latest row', () => {
    expect(describeKp(parseKp1m(makeKp1m()))).toEqual({ kp: '3.3', gScale: 'G0', label: 'Quiet', time: '00:27 UTC' })
  })

  it('reports a storm', () => {
    const rows = parseKp1m(makeKp1m([{ time_tag: '2026-09-25T12:00:00', kp_index: 7, estimated_kp: 6.67 }]))
    expect(describeKp(rows)).toMatchObject({ kp: '6.7', gScale: 'G3', label: 'Strong storm' })
  })
})
