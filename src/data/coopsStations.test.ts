import { describe, expect, it } from 'vitest'
import { COOPS_STATIONS } from './coopsStations'

describe('COOPS_STATIONS', () => {
  it('is a validated snapshot of unique stations', () => {
    expect(COOPS_STATIONS.length).toBeGreaterThan(250)
    expect(new Set(COOPS_STATIONS.map((s) => s.id)).size).toBe(COOPS_STATIONS.length)
  })

  it('includes the station the node sample uses', () => {
    expect(COOPS_STATIONS.find((s) => s.id === '8729108')?.name).toBe('Panama City')
  })
})
