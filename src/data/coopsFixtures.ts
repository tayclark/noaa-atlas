// Real CO-OPS response shapes (checked 2026-09-30) for unit and e2e tests.

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
