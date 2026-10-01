import { describe, expect, it } from 'vitest'
import { NDBC_STATIONS } from './ndbcStations'

describe('NDBC_STATIONS', () => {
  it('is a validated snapshot of unique stations', () => {
    expect(NDBC_STATIONS.length).toBeGreaterThan(50)
    expect(new Set(NDBC_STATIONS.map((s) => s.id)).size).toBe(NDBC_STATIONS.length)
  })

  it('includes the station the node sample uses', () => {
    expect(NDBC_STATIONS.find((s) => s.id === '42001')).toBeDefined()
  })
})
