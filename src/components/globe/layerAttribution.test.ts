import { describe, expect, it } from 'vitest'
import { alertLayers } from './nwsAlertsLayer'
import { coopsStationLayers } from './coopsStationsLayer'
import { dartStationLayers } from './dartStationsLayer'
import { ndbcStationLayers } from './ndbcStationsLayer'
import { nhcTrackLayers } from './nhcTracksLayer'
import { spcOutlookLayers } from './spcOutlookLayer'

// MapLibre has no attribution field for canvas sources, so the aurora, wind, wave and simulated
// radar overlays can't carry one this way.
// NOAA's data is credited wherever it is shown, so no layer's source may leave the map's attribution
// control without a credit (#354).
describe('layer attribution', () => {
  const groups = {
    alerts: alertLayers({ type: 'FeatureCollection', features: [] }, { level: 'normal', fillOpacity: 0.3, lineWidth: 1 }),
    coops: coopsStationLayers([]),
    dart: dartStationLayers(),
    ndbc: ndbcStationLayers(),
    nhc: nhcTrackLayers(),
    spc: spcOutlookLayers(),
  }
  it.each(Object.entries(groups))('credits the %s source', (_name, group) => {
    const attribution = 'attribution' in group.source ? group.source.attribution : undefined
    expect(attribution).toMatch(/<a href="https:\/\/[^"]+">[^<]*NOAA[^<]*<\/a>/)
  })
})
