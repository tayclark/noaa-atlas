import { beforeAll, describe, expect, it } from 'vitest'
import { loadDartStations, type DartStation } from './dartStations'

let DART_STATIONS: DartStation[]

beforeAll(async () => {
  DART_STATIONS = await loadDartStations()
})

describe('loadDartStations', () => {
  it('loads the snapshot once', () => {
    expect(loadDartStations()).toBe(loadDartStations())
  })

  it('is a validated snapshot of unique stations', () => {
    expect(DART_STATIONS.length).toBeGreaterThan(50)
    expect(new Set(DART_STATIONS.map((s) => s.id)).size).toBe(DART_STATIONS.length)
  })

  it('includes the station the node sample uses', () => {
    expect(DART_STATIONS.find((s) => s.id === '21414')?.name).toMatch(/AMCHITKA/)
  })
})
