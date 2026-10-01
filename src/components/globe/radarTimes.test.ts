import { describe, expect, it } from 'vitest'
import { formatFrameOffset, frameForTime, parseRadarFrames } from './radarTimes'

const CAPABILITIES = `
<Layer queryable="1"><Name>base_reflectivity_mosaic</Name><Title>Group</Title>
  <Layer queryable="1"><Name>conus_base_reflectivity_mosaic</Name><Title>CONUS</Title>
    <Dimension name="time" default="2026-10-01T03:24:12Z" units="ISO8601" nearestValue="1">2026-09-30T21:12:10.000Z,2026-09-30T21:04:07.000Z, 2026-09-30T21:07:59.000Z</Dimension>
  </Layer>
  <Layer queryable="1"><Name>alaska_base_reflectivity_mosaic</Name>
    <Dimension name="time" default="x" units="ISO8601">2026-09-30T20:00:00.000Z</Dimension>
  </Layer>
</Layer>`

describe('parseRadarFrames', () => {
  it("reads the CONUS layer's time list, sorted oldest first", () => {
    expect(parseRadarFrames(CAPABILITIES)).toEqual([
      '2026-09-30T21:04:07.000Z',
      '2026-09-30T21:07:59.000Z',
      '2026-09-30T21:12:10.000Z',
    ])
  })

  it('returns nothing when the layer is missing or has no dimension', () => {
    expect(parseRadarFrames('<Capabilities/>')).toEqual([])
    expect(parseRadarFrames('<Name>conus_base_reflectivity_mosaic</Name><Name>other</Name><Dimension name="time">2026-09-30T21:04:07Z</Dimension>')).toEqual([])
  })

  it('drops entries that are not timestamps', () => {
    const xml = '<Name>conus_base_reflectivity_mosaic</Name><Dimension name="time">nope,2026-09-30T21:04:07Z</Dimension>'
    expect(parseRadarFrames(xml)).toEqual(['2026-09-30T21:04:07Z'])
  })
})

describe('formatFrameOffset', () => {
  const latest = '2026-10-01T03:00:00.000Z'

  it.each([
    ['2026-10-01T03:00:00.000Z', 'Latest'],
    ['2026-10-01T02:36:00.000Z', '24 min earlier'],
    ['2026-10-01T01:56:00.000Z', '1 h 4 min earlier'],
    ['2026-10-01T00:00:00.000Z', '3 h earlier'],
  ])('%s reads %s', (frame, label) => {
    expect(formatFrameOffset(frame, latest)).toBe(label)
  })
})

describe('frameForTime', () => {
  const frames = ['2026-10-01T02:40:00Z', '2026-10-01T02:50:00Z', '2026-10-01T03:00:00Z']
  const at = (iso: string) => Date.parse(iso)

  it('follows the latest frame for now, for the latest time and for the future', () => {
    expect(frameForTime(frames, null)).toBeNull()
    expect(frameForTime(frames, at('2026-10-01T03:00:00Z'))).toBeNull()
    expect(frameForTime(frames, at('2026-10-02T00:00:00Z'))).toBeNull()
  })

  it('snaps an earlier time to the nearest frame', () => {
    expect(frameForTime(frames, at('2026-10-01T02:44:00Z'))).toBe(frames[0])
    expect(frameForTime(frames, at('2026-10-01T02:47:00Z'))).toBe(frames[1])
  })

  it('uses the oldest frame for a time before them all', () => {
    expect(frameForTime(frames, at('2026-09-30T00:00:00Z'))).toBe(frames[0])
  })

  it('has no frame without frames', () => {
    expect(frameForTime([], at('2026-10-01T02:44:00Z'))).toBeNull()
  })
})
