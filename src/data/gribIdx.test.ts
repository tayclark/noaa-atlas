import idx from './fixtures/gfs-1p00-f012.idx?raw'
import { describe, expect, it } from 'vitest'
import { findGribField, parseGribIdx, rangeHeader } from './gribIdx'

describe('parseGribIdx', () => {
  it('reads name, level, forecast and byte offsets', () => {
    const entries = parseGribIdx(idx)
    expect(entries).toHaveLength(9)
    expect(entries[0]).toMatchObject({ name: 'PRMSL', level: 'mean sea level', forecast: '12 hour fcst', start: 0, end: 75374 })
  })

  it('leaves the last entry open-ended and ignores junk lines', () => {
    const entries = parseGribIdx(`${idx}\nnot an index line\n`)
    expect(entries.at(-1)?.end).toBeNull()
    expect(entries).toHaveLength(9)
  })
})

describe('findGribField / rangeHeader', () => {
  const entries = parseGribIdx(idx)

  it('finds the 10 m wind components and builds their Range header', () => {
    const u = findGribField(entries, 'UGRD', '10 m above ground')
    expect(u).toBeDefined()
    expect(rangeHeader(u!)).toBe('bytes=35505644-35584766')
    expect(findGribField(entries, 'VGRD', '10 m above ground')?.start).toBe(35584767)
  })

  it('returns undefined for a field that is not listed', () => {
    expect(findGribField(entries, 'HTSGW', 'surface')).toBeUndefined()
  })

  it('writes an open-ended range for the final message', () => {
    expect(rangeHeader({ name: 'X', level: 'y', forecast: 'z', start: 10, end: null })).toBe('bytes=10-')
  })
})
