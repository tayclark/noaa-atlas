import { describe, expect, it } from 'vitest'
import { NhcHttpError, NhcParseError } from '../../data/nhcClient'
import { emptyNhcStormData, makeCone, makeForecastPoint, makeNhcStormData, makePastPoint } from '../../data/nhcFixtures'
import {
  advisoryFrameIndex,
  buildStormTracks,
  categoriesInTracks,
  categoryFor,
  categoryLabel,
  describeNhcFetchOutcome,
  describeStormState,
  formatAdvisoryOffset,
  formatFixPopupHtml,
  formatStormTime,
  frameTimes,
  framingPadding,
  parseDtg,
  parseValidTime,
  stateAt,
  stepToFix,
  shortStormName,
  stormBounds,
  trackFeatures,
  type StormTrack,
} from './stormTrack'

const HOUR = 3_600_000
const utc = (iso: string) => Date.parse(iso)

function isaias(): StormTrack {
  const track = buildStormTracks(makeNhcStormData()).find((t) => t.bin === 'AT4')
  if (!track) throw new Error('fixture has no AT4')
  return track
}

describe('parseDtg', () => {
  it('reads YYYYMMDDHH as UTC', () => {
    expect(parseDtg(2026100918)).toBe(utc('2026-10-09T18:00:00Z'))
  })
})

describe('parseValidTime', () => {
  const file = utc('2026-10-09T17:42:36Z')

  it('takes the month and year from the advisory file', () => {
    expect(parseValidTime('09/1500', file)).toBe(utc('2026-10-09T15:00:00Z'))
    expect(parseValidTime('14/1200', file)).toBe(utc('2026-10-14T12:00:00Z'))
  })

  it('rolls into the next month, and the next year, past a month end', () => {
    expect(parseValidTime('02/0000', utc('2026-10-30T03:00:00Z'))).toBe(utc('2026-11-02T00:00:00Z'))
    expect(parseValidTime('01/1200', utc('2026-12-29T21:00:00Z'))).toBe(utc('2027-01-01T12:00:00Z'))
  })

  it('keeps a tau 0 from the end of the previous month when the file was written just after midnight', () => {
    expect(parseValidTime('31/2100', utc('2026-11-01T00:05:00Z'))).toBe(utc('2026-10-31T21:00:00Z'))
  })

  it('is NaN for an unreadable time', () => {
    expect(parseValidTime('soon', file)).toBeNaN()
  })
})

describe('buildStormTracks', () => {
  it('groups each storm, most intense first, with observed fixes before the advisory then the forecast', () => {
    const tracks = buildStormTracks(makeNhcStormData())
    expect(tracks.map((t) => t.bin)).toEqual(['AT4', 'EP3'])
    const [track] = tracks as [StormTrack]
    expect(track.name).toBe('Hurricane Isaias')
    expect(track.advisoryTime).toBe(utc('2026-10-09T15:00:00Z'))
    expect(track.fixes.map((f) => f.forecast)).toEqual([false, false, false, false, false, false, true, true, true])
    expect(track.fixes[0]).toMatchObject({ t: utc('2026-10-08T06:00:00Z'), windKt: 70, label: 'Hurricane' })
    expect(track.fixes[6]).toMatchObject({ windKt: 105, label: 'Major Hurricane', lon: -87.2, lat: 28.4 })
    expect(track.cone?.type).toBe('Polygon')
    expect(tracks[1]?.cone).toBeNull()
  })

  it('drops an observed fix at or after the advisory, since tau 0 already places the storm', () => {
    const data = makeNhcStormData()
    data.past.features.push(makePastPoint('AT4', 'ISAIAS', 'HU', 105, 2026100915, [-87.3, 28.3]))
    const track = buildStormTracks(data)[0] as StormTrack
    expect(track.fixes.filter((f) => f.t === track.advisoryTime)).toHaveLength(1)
  })

  it('keeps a storm with only observed fixes, named from them, and one with only a forecast', () => {
    const data = emptyNhcStormData()
    data.past.features.push(makePastPoint('CP1', 'KALE', 'EX', 30, 2026100900, [-150, 20]), makePastPoint('CP1', 'KALE', 'EX', 25, 2026100906, [-149, 21]))
    data.forecast.features.push(makeForecastPoint('AT5', 'Tropical Depression Ten', 0, '09/1500', 30, 'Tropical Depression', [-50, 12]))
    const tracks = buildStormTracks(data)
    expect(tracks.map((t) => [t.bin, t.name])).toEqual([
      ['AT5', 'Tropical Depression Ten'],
      ['CP1', 'Kale'],
    ])
    expect(tracks[1]?.advisoryTime).toBe(utc('2026-10-09T06:00:00Z'))
    expect(tracks[1]?.fixes[0]?.label).toBe('Post-tropical')
  })

  it('shows an unknown system type as NHC wrote it, and skips forecast fixes with an unreadable time', () => {
    const data = emptyNhcStormData()
    data.past.features.push(makePastPoint('AT1', 'X', 'ZZ', 20, 2026100900, [-40, 10]))
    data.forecast.features.push(makeForecastPoint('AT1', 'Low X', 0, '??', 20, 'Low', [-40, 11]))
    const [track] = buildStormTracks(data) as [StormTrack]
    expect(track.fixes).toHaveLength(1)
    expect(track.fixes[0]?.label).toBe('ZZ')
  })

  it('is empty when no storm is active', () => {
    expect(buildStormTracks(emptyNhcStormData())).toEqual([])
  })
})

describe('stateAt', () => {
  it('interpolates position and wind between fixes', () => {
    const state = stateAt(isaias(), utc('2026-10-08T09:00:00Z'))
    expect(state.lon).toBeCloseTo(-91.05)
    expect(state.lat).toBeCloseTo(23.25)
    expect(state.windKt).toBeCloseTo(72.5)
    expect(state.forecast).toBe(false)
  })

  it('takes the label of the nearer fix and marks times after the advisory as forecast', () => {
    const state = stateAt(isaias(), utc('2026-10-10T09:00:00Z'))
    expect(state.label).toBe('Tropical Storm')
    expect(state.forecast).toBe(true)
  })

  it('clamps to the ends of the track', () => {
    const track = isaias()
    expect(stateAt(track, 0)).toMatchObject({ lon: -91.5, lat: 23.1 })
    expect(stateAt(track, utc('2030-01-01T00:00:00Z'))).toMatchObject({ lon: -87.1, lat: 32.1 })
  })

  it('goes the short way across the antimeridian', () => {
    const data = emptyNhcStormData()
    data.past.features.push(makePastPoint('CP1', 'A', 'TS', 40, 2026100900, [179, 20]), makePastPoint('CP1', 'A', 'TS', 40, 2026100906, [-179, 20]))
    const [track] = buildStormTracks(data) as [StormTrack]
    expect(Math.abs(stateAt(track, utc('2026-10-09T03:00:00Z')).lon)).toBeCloseTo(180)
    const features = trackFeatures([track], 'CP1', null).features
    const past = features.find((f) => f.properties.kind === 'past')
    expect(past?.geometry.coordinates).toEqual([[179, 20], [181, 20]])
  })
})

describe('frames', () => {
  it('steps hourly from the first fix to the last, starting playback at the advisory', () => {
    const track = isaias()
    const frames = frameTimes(track)
    expect(frames[0]).toBe(utc('2026-10-08T06:00:00Z'))
    expect(frames[frames.length - 1]).toBe(utc('2026-10-10T12:00:00Z'))
    expect(frames[1]! - frames[0]!).toBe(HOUR)
    expect(frames[advisoryFrameIndex(frames, track)]).toBe(track.advisoryTime)
  })

  it('steps fix to fix, staying put at either end', () => {
    const track = isaias()
    const frames = frameTimes(track)
    const between = frames.indexOf(utc('2026-10-08T09:00:00Z'))
    expect(frames[stepToFix(frames, track, between, 1)]).toBe(utc('2026-10-08T12:00:00Z'))
    expect(frames[stepToFix(frames, track, between, -1)]).toBe(utc('2026-10-08T06:00:00Z'))
    expect(stepToFix(frames, track, 0, -1)).toBe(0)
    expect(stepToFix(frames, track, frames.length - 1, 1)).toBe(frames.length - 1)
  })

  it('puts the advisory frame last when nothing reaches it', () => {
    expect(advisoryFrameIndex([1, 2], { ...isaias(), advisoryTime: 10 })).toBe(1)
  })
})

describe('trackFeatures', () => {
  it('draws every storm, and a trail and marker only for the chosen one', () => {
    const tracks = buildStormTracks(makeNhcStormData())
    const t = utc('2026-10-10T00:00:00Z')
    const { features } = trackFeatures(tracks, 'AT4', t)
    const kinds = (bin: string) => features.filter((f) => f.properties.bin === bin).map((f) => f.properties.kind)
    expect(new Set(kinds('AT4'))).toEqual(new Set(['cone', 'past', 'forecast', 'fix', 'trail', 'marker']))
    expect(new Set(kinds('EP3'))).toEqual(new Set(['past', 'forecast', 'fix']))
    const marker = features.find((f) => f.properties.kind === 'marker')
    expect(marker?.geometry.coordinates).toEqual([-86.8, 29.7])
    expect(marker?.properties.color).toBe(categoryFor(100).color)
    const trail = features.find((f) => f.properties.kind === 'trail')
    expect(trail?.geometry.coordinates).toHaveLength(8)
    // The forecast line starts where the observed one ends.
    const forecast = features.find((f) => f.properties.kind === 'forecast' && f.properties.bin === 'AT4')
    expect(forecast?.geometry.coordinates[0]).toEqual([-87.6, 27.0])
  })

  it('draws every storm alike, without a marker, when none is chosen', () => {
    const { features } = trackFeatures(buildStormTracks(makeNhcStormData()), null, null)
    expect(features.every((f) => f.properties.selected === true)).toBe(true)
    expect(features.some((f) => f.properties.kind === 'marker' || f.properties.kind === 'trail')).toBe(false)
  })

  it('leaves out the marker when there is no time yet', () => {
    const { features } = trackFeatures(buildStormTracks(makeNhcStormData()), 'AT4', null)
    expect(features.some((f) => f.properties.kind === 'marker')).toBe(false)
  })
})

describe('stormBounds', () => {
  it('frames the track and the cone', () => {
    expect(stormBounds(isaias())).toEqual([-91.5, 23.1, -85.9, 32.4])
  })

  it('handles a multi-part cone', () => {
    const track = { ...isaias(), cone: { type: 'MultiPolygon' as const, coordinates: [makeCone('AT4', [[-80, 40], [-79, 40], [-79, 41], [-80, 40]]).geometry.coordinates as number[][][]] } }
    expect(stormBounds(track)).toEqual([-91.5, 23.1, -79, 41])
  })
})

describe('labels', () => {
  it('names categories on the Saffir-Simpson scale', () => {
    expect(categoryLabel(categoryFor(30))).toBe('TD')
    expect(categoryLabel(categoryFor(34))).toBe('TS')
    expect(categoryLabel(categoryFor(105))).toBe('Cat 3')
    expect(categoryLabel(categoryFor(140))).toBe('Cat 5')
    expect(describeStormState({ t: 0, lon: 0, lat: 0, windKt: 72.6, label: 'Hurricane', forecast: false })).toBe('73 kt, Cat 1')
    expect(describeStormState({ t: 0, lon: 0, lat: 0, windKt: 15, label: 'Disturbance', forecast: false })).toBe('15 kt, Disturbance')
  })

  it('shortens a storm to its own name for the chips', () => {
    expect(shortStormName('Hurricane Isaias')).toBe('Isaias')
    expect(shortStormName('Major Hurricane Isaias')).toBe('Isaias')
    expect(shortStormName('Potential Tropical Cyclone Two')).toBe('Two')
    expect(shortStormName('Post-Tropical Cyclone Kale')).toBe('Kale')
    expect(shortStormName('Invest')).toBe('Invest')
  })

  it('times fixes in UTC against the advisory', () => {
    expect(formatStormTime(utc('2026-10-09T15:00:00Z'))).toBe('Fri 9 Oct, 15:00 UTC')
    const advisory = utc('2026-10-09T15:00:00Z')
    expect(formatAdvisoryOffset(advisory, advisory)).toBe('latest advisory')
    expect(formatAdvisoryOffset(advisory + 12 * HOUR, advisory)).toBe('forecast +12 h')
    expect(formatAdvisoryOffset(advisory - 18 * HOUR, advisory)).toBe('18 h before advisory')
  })

  it('escapes the fix popup and lists the categories the storms reach', () => {
    const html = formatFixPopupHtml({ name: '<b>X</b>', t: utc('2026-10-09T15:00:00Z'), windKt: 105, label: 'Major Hurricane', forecast: true })
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
    expect(html).toContain('(forecast)')
    expect(html).toContain('105 kt (Category 3)')
    expect(categoriesInTracks(buildStormTracks(makeNhcStormData())).map((c) => c.key)).toEqual(['TS', '1', '2', '3'])
  })

  it('describes each kind of failed fetch', () => {
    expect(describeNhcFetchOutcome(new NhcHttpError(503))).toMatch(/unavailable/)
    expect(describeNhcFetchOutcome(new NhcParseError('x', null))).toMatch(/unexpected/)
    expect(describeNhcFetchOutcome(new TypeError('fetch'))).toMatch(/Could not reach/)
    expect(describeNhcFetchOutcome('?')).toMatch(/Something went wrong/)
  })
})

describe('framingPadding', () => {
  it('clears the card above and the controls below, with a margin', () => {
    expect(framingPadding({ width: 700, height: 850 }, 200, 300)).toEqual({ top: 224, bottom: 324, left: 60, right: 60 })
  })

  it('keeps a third of the height for the storm when the overlays would take more', () => {
    const padding = framingPadding({ width: 360, height: 400 }, 250, 250)
    expect(padding.top + padding.bottom).toBeLessThanOrEqual(400 - 400 / 3)
    expect(padding.left).toBe(45)
  })

  it('keeps a margin where there is no overlay', () => {
    expect(framingPadding({ width: 1000, height: 800 }, 0, 0)).toMatchObject({ top: 24, bottom: 24 })
  })
})
