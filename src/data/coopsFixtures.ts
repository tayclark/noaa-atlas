// Real CO-OPS response shapes (checked 2026-09-30; the Metadata and Derived Product ones 2026-10-03)
// for unit and e2e tests.

export function makeWaterLevel(overrides: { v?: string; t?: string } = {}) {
  return {
    metadata: { id: '8729108', name: 'Panama City', lat: '30.1497', lon: '-85.6644' },
    data: [{ t: overrides.t ?? '2026-09-30 13:48', v: overrides.v ?? '0.403', s: '0.006', f: '1,0,0,0', q: 'p' }],
  }
}

export function makePredictions() {
  return {
    predictions: [
      { t: '2026-09-30 04:34', v: '0.598', type: 'H' },
      { t: '2026-09-30 15:46', v: '0.073', type: 'L' },
    ],
  }
}

export function makeHourlyPredictions() {
  return {
    predictions: [
      { t: '2026-10-01 00:00', v: '0.392' },
      { t: '2026-10-01 01:00', v: '0.455' },
      { t: '2026-10-01 02:00', v: '0.514' },
    ],
  }
}

export function makeCoopsError(message = 'There is no MLLW for the station: 9999999') {
  return { error: { message } }
}

/** mdapi stations/8729108.json?expand=details,datums,floodlevels&units=metric, trimmed. */
export function makeStationMetadata() {
  return {
    count: 1,
    units: null,
    stations: [
      {
        id: '8729108',
        name: 'Panama City',
        state: 'FL',
        lat: 30.149723,
        lng: -85.664444,
        details: { id: '8729108', established: '1973-02-11 00:00:00', removed: '', noaachart: '11391', timezone: -6.0 },
        floodlevels: { nos_minor: 1.944, nos_moderate: 2.24, nos_major: 2.614, nws_minor: 2.035, nws_moderate: 2.492, nws_major: 2.952, action: null },
        datums: {
          accepted: 'Apr 17 2003',
          epoch: '1983-2001',
          units: 'meters',
          OrthometricDatum: 'NAVD88',
          datums: [
            { name: 'STND', description: 'Station Datum', value: 0.0 },
            { name: 'MHHW', description: 'Mean Higher-High Water', value: 1.428 },
            { name: 'MLLW', description: 'Mean Lower-Low Water', value: 1.018 },
          ],
        },
      },
    ],
  }
}

/** dpapi product/sealvltrends.json?station=8729108&units=metric, trimmed. */
export function makeSeaLevelTrend() {
  return {
    count: 1,
    SeaLvlTrends: [
      {
        stationId: '8729108',
        stationName: 'Panama City',
        trendUnits: 'mm/yr',
        trend: 3.08,
        trendError: 0.26,
        startDate: '03/15/1973',
        endDate: '12/15/2025',
        seasonalCycleMonth: [{ month: 1, seasonalVar: -10.4, seasonalErr: 0.8 }],
      },
    ],
  }
}

/** dpapi htf/htf_annual.json?station=8729108: one row per year, with null counts before the record starts. */
export function makeHtfAnnual(lastYear = 2026, years = 14) {
  const row = (year: number, counts: [number, number, number] | null) => ({
    stnId: '8729108',
    stnName: 'Panama City, FL',
    lat: '30.149723',
    lon: '-85.664444',
    year,
    majCount: counts && counts[2],
    modCount: counts && counts[1],
    minCount: counts && counts[0],
    nanCount: counts ? 0 : 365,
    percent_completeness: counts ? 100.0 : null,
  })
  const first = lastYear - years + 1
  return {
    count: years + 1,
    AnnualFloodCount: [
      row(first - 1, null),
      ...Array.from({ length: years }, (_, i) => row(first + i, first + i === 2024 ? [6, 1, 0] : [0, 0, 0])),
    ],
  }
}
