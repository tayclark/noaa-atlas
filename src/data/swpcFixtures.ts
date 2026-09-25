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
