// Small SWPC payloads in the real feeds' shapes (checked 2026-09-24), shared by unit tests.

export function makeOvation(coordinates: [number, number, number][] = [[0, -90, 4], [0, 65, 0], [200, 65, 22]]) {
  return {
    'Observation Time': '2026-09-25T00:20:00Z',
    'Forecast Time': '2026-09-25T01:22:00Z',
    'Data Format': '[Longitude, Latitude, Aurora]',
    coordinates,
    type: 'MultiPoint',
  }
}

export function makeKp1m(rows: { time_tag: string; kp_index: number; estimated_kp: number }[] = [
  { time_tag: '2026-09-25T00:26:00', kp_index: 2, estimated_kp: 2.33 },
  { time_tag: '2026-09-25T00:27:00', kp_index: 3, estimated_kp: 3.33 },
]) {
  return rows.map((row) => ({ ...row, kp: `${row.kp_index}P` }))
}

const scale = (Scale: string | null, Text: string | null, extra: Record<string, string | null> = {}) => ({ Scale, Text, ...extra })

/** noaa-scales.json shape (checked 2026-10-01): observed periods have Scale/Text, forecast days probabilities. */
export function makeScales() {
  const observed = (key: string) => ({
    DateStamp: '2026-10-01',
    TimeStamp: '17:44:00',
    R: scale('0', 'none', { MinorProb: null, MajorProb: null }),
    S: scale('0', 'none', { Prob: null }),
    G: scale(key === '-1' ? '1' : '0', key === '-1' ? 'minor' : 'none'),
  })
  const forecast = (date: string, g: string, text: string) => ({
    DateStamp: date,
    TimeStamp: '00:00:00',
    R: scale(null, null, { MinorProb: '15', MajorProb: '1' }),
    S: scale(null, null, { Prob: '1' }),
    G: scale(g, text),
  })
  return {
    '-1': observed('-1'),
    '0': observed('0'),
    '1': forecast('2026-10-01', '0', 'none'),
    '2': forecast('2026-10-02', '1', 'minor'),
    '3': forecast('2026-10-03', '0', 'none'),
  }
}

export function makeAlerts() {
  return [
    {
      product_id: 'EF3A',
      issue_datetime: '2026-10-01 14:30:29.700',
      message:
        'Space Weather Message Code: ALTEF3\r\nSerial Number: 3750\r\nIssue Time: 2026 Oct 01 1430 UTC\r\n\r\nCONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu\nContinuation of Serial Number: 3749',
    },
    {
      product_id: 'A20F',
      issue_datetime: '2026-10-01 14:28:54.257',
      message:
        'Space Weather Message Code: WATA20\r\nSerial Number: 1128\r\nIssue Time: 2026 Oct 01 1428 UTC\r\n\r\nWATCH: Geomagnetic Storm Category G1 Predicted\nHighest Storm Level Predicted by Day: Oct 02: G1',
    },
  ]
}

/** rtsw_wind_1m.json rows, newest first, with an inactive spacecraft interleaved as in the real file. */
export function makeSolarWindRows(minutes = 3) {
  const time = (i: number) => `2026-10-01T17:${String(44 - i).padStart(2, '0')}:00`
  return Array.from({ length: minutes }, (_, i) => [
    { time_tag: time(i), active: true, source: 'SOLAR1', proton_speed: 430 - i, proton_density: 7.9, proton_temperature: 129322 },
    { time_tag: time(i), active: false, source: 'ACE', proton_speed: 400, proton_density: 5, proton_temperature: 100000 },
  ]).flat()
}

/** rtsw_mag_1m.json rows, newest first, with an inactive spacecraft interleaved as in the real file. */
export function makeSolarWindMagRows(minutes = 3) {
  const time = (i: number) => `2026-10-01T17:${String(44 - i).padStart(2, '0')}:00`
  return Array.from({ length: minutes }, (_, i) => [
    { time_tag: time(i), active: true, source: 'SOLAR1', bt: 6.39, bz_gsm: -2 - i },
    { time_tag: time(i), active: false, source: 'ACE', bt: 5, bz_gsm: 2 },
  ]).flat()
}

/** xrays-6-hour.json rows: one per minute for each band. */
export function makeXrayRows(minutes = 3) {
  const time = (i: number) => `2026-10-01T17:${String(44 - i).padStart(2, '0')}:00Z`
  return Array.from({ length: minutes }, (_, i) => [
    { time_tag: time(i), satellite: 18, flux: 2.4e-7, observed_flux: 2.4e-7, energy: '0.1-0.8nm' },
    { time_tag: time(i), satellite: 18, flux: 1e-9, observed_flux: 7.4e-9, energy: '0.05-0.4nm' },
  ]).flat()
}
