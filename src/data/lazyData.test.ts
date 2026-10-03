import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('lazily loaded snapshots (#269)', () => {
  it('keeps the dataset catalogs and buoy lists out of every static import', () => {
    // A static import would put the file back in its importer's chunk; `import('./x.json')` is fine.
    const staticImport = /from '[^']*\/(?:nceiDatasets|onestopDatasets|awsOpenDataDatasets|dartStations|ndbcStations)\.json'/
    const offenders = Object.entries(sources)
      .filter(([, source]) => staticImport.test(source))
      .map(([path]) => path)
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(offenders).toEqual([])
  })
})
