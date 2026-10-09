import { describe, expect, it } from 'vitest'
import { describeGoesFrame, GOES_TILE_URL, goesFrameForTime, goesTileUrl, parseGoesFrames } from './goesSatelliteLayer'

const FRAMES = ['2026-10-09T12:03:00.000Z', '2026-10-09T12:08:00.000Z', '2026-10-09T12:13:00.000Z']
const at = (iso: string) => Date.parse(iso)

// The shape of nowCOAST's satellite GetCapabilities (curled 2026-10-09), trimmed to two layers.
const CAPABILITIES = `<WMS_Capabilities><Capability><Layer>
<Layer queryable="1"><Name>global_longwave_imagery_mosaic</Name><Title>Global</Title>
<Dimension name="time" default="current" units="ISO8601">2026-10-09T13:00:00.000Z</Dimension></Layer>
<Layer queryable="1"><Name>goes_longwave_imagery</Name><Title>GOES East &amp; West Satellite Longwave Imagery</Title>
<Dimension name="time" default="current" units="ISO8601">${[...FRAMES].reverse().join(',')}</Dimension></Layer>
</Layer></Capability></WMS_Capabilities>`

describe('parseGoesFrames', () => {
  it('reads the GOES longwave layer, oldest first, not its neighbours', () => {
    expect(parseGoesFrames(CAPABILITIES)).toEqual(FRAMES)
    expect(parseGoesFrames('<WMS_Capabilities/>')).toEqual([])
  })
})

describe('goesFrameForTime', () => {
  it('snaps a time inside the archive to the nearest frame', () => {
    expect(goesFrameForTime(FRAMES, at('2026-10-09T12:07:00Z'))).toBe(FRAMES[1])
    expect(goesFrameForTime(FRAMES, at('2026-10-09T12:00:00Z'))).toBe(FRAMES[0])
  })

  it('shows the latest image for a time before the archive, at or after its end, or none at all', () => {
    expect(goesFrameForTime(FRAMES, at('2026-10-09T06:00:00Z'))).toBeNull()
    expect(goesFrameForTime(FRAMES, at('2026-10-09T12:13:00Z'))).toBeNull()
    expect(goesFrameForTime(FRAMES, at('2026-10-10T00:00:00Z'))).toBeNull()
    expect(goesFrameForTime(FRAMES, null)).toBeNull()
    expect(goesFrameForTime([], at('2026-10-09T12:07:00Z'))).toBeNull()
  })
})

describe('goesTileUrl', () => {
  it('leaves the time out for the latest image and adds it for a past frame', () => {
    expect(goesTileUrl(null)).toBe(GOES_TILE_URL)
    expect(goesTileUrl(FRAMES[0] as string)).toBe(`${GOES_TILE_URL}&time=2026-10-09T12%3A03%3A00.000Z`)
    expect(GOES_TILE_URL).toContain('layers=goes_longwave_imagery')
  })
})

describe('describeGoesFrame', () => {
  it('names the image time, saying when it is the latest rather than the slider time', () => {
    expect(describeGoesFrame(FRAMES, FRAMES[1] as string)).toBe('satellite 12:08 UTC')
    expect(describeGoesFrame(FRAMES, null)).toBe('satellite latest, 12:13 UTC')
    expect(describeGoesFrame([], null)).toBeNull()
  })
})
