import { describe, expect, it } from 'vitest'
import { makeNhcStormData } from '../../data/nhcFixtures'
import { describeStormImpact, stormImpactAt, type ImpactAlert } from './stormImpact'
import { buildStormTracks } from './stormTrack'

const TRACKS = buildStormTracks(makeNhcStormData())
// The fixture cone for Isaias runs from about (-87.6, 28.2) to (-85.9, 32.4).
const IN_CONE = [-87, 30] as const
const OUTSIDE = [-80, 26] as const
const box = (w: number, s: number, e: number, n: number) => ({ type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })

describe('stormImpactAt', () => {
  it('names the storm whose forecast cone holds the point', () => {
    expect(stormImpactAt(IN_CONE, TRACKS, [])).toEqual({ bin: 'AT4', name: 'Hurricane Isaias', alertEvent: null, inCone: true })
  })

  it('counts a tropical watch or warning outside the cone, put down to the nearest storm, and picks the most urgent', () => {
    const alerts: ImpactAlert[] = [
      { event: 'Tropical Storm Watch', geometry: box(-81, 25, -79, 27) },
      { event: 'Hurricane Warning', geometry: { type: 'MultiPolygon', coordinates: [box(-81, 25, -79, 27).coordinates] } },
    ]
    expect(stormImpactAt(OUTSIDE, TRACKS, alerts)).toEqual({ bin: 'AT4', name: 'Hurricane Isaias', alertEvent: 'Hurricane Warning', inCone: false })
  })

  it('ignores other alerts, zone-only alerts and places outside every cone', () => {
    const alerts: ImpactAlert[] = [
      { event: 'Flood Warning', geometry: box(-81, 25, -79, 27) },
      { event: 'Hurricane Warning', geometry: null },
    ]
    expect(stormImpactAt(OUTSIDE, TRACKS, alerts)).toBeNull()
  })

  it('offers nothing without an active storm, even under a warning', () => {
    expect(stormImpactAt(OUTSIDE, [], [{ event: 'Hurricane Warning', geometry: box(-81, 25, -79, 27) }])).toBeNull()
  })
})

describe('describeStormImpact', () => {
  it('says why the place is affected', () => {
    const base = { bin: 'AT4', name: 'Hurricane Isaias' }
    expect(describeStormImpact({ ...base, alertEvent: null, inCone: true })).toEqual({
      title: 'Hurricane Isaias may affect this location',
      reason: "It is inside the storm's 5-day forecast cone.",
    })
    expect(describeStormImpact({ ...base, alertEvent: 'Hurricane Warning', inCone: false }).reason).toBe('A Hurricane Warning is in effect here.')
    expect(describeStormImpact({ ...base, alertEvent: 'Storm Surge Warning', inCone: true }).reason).toBe(
      "A Storm Surge Warning is in effect here, inside the storm's forecast cone.",
    )
  })
})
