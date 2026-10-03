import { describe, expect, it, vi } from 'vitest'
import { parseAlerts, parseScales, parseSolarWind, parseSolarWindMag, parseXrays } from '../../data/swpcSchema'
import { makeAlerts, makeScales, makeSolarWindMagRows, makeSolarWindRows, makeXrayRows } from '../../data/swpcFixtures'
import { alertsTable, flareClass, scalesTable, solarWindTable, SWPC_TRY_ITS, xraysTable } from './swpcTryIt'

vi.mock('../../data/swpcClient', () => ({
  getNoaaScales: () => Promise.resolve(parseScales(makeScales())),
  getSpaceWeatherAlerts: () => Promise.resolve(parseAlerts(makeAlerts())),
  getSolarWind: () => Promise.resolve(parseSolarWind(makeSolarWindRows(12))),
  getSolarWindMag: () => Promise.resolve(parseSolarWindMag(makeSolarWindMagRows(12))),
  getGoesXrays: () => Promise.resolve(parseXrays(makeXrayRows(12))),
}))

describe('scalesTable', () => {
  it('orders the past 24 hours, now and the forecast days, showing probabilities for forecasts', () => {
    const { rows } = scalesTable(parseScales(makeScales()))
    expect(rows.map((r) => r[0])).toEqual(['Past 24 hours', 'Now', 'Forecast 2026-10-01', 'Forecast 2026-10-02', 'Forecast 2026-10-03'])
    expect(rows[0]).toEqual(['Past 24 hours', 'R0 none', 'S0 none', 'G1 minor'])
    expect(rows[3]).toEqual(['Forecast 2026-10-02', '15% minor, 1% major', '1%', 'G1 minor'])
  })

  it('says n/a when a cell has neither a scale nor probabilities', () => {
    const scales = parseScales({ '1': { ...makeScales()['1'], S: { Scale: null, Text: null } } })
    expect(scalesTable(scales).rows[0][2]).toBe('n/a')
  })
})

describe('alertsTable', () => {
  it('lists the newest alerts first with the subject line after the issue time', () => {
    const { rows } = alertsTable(parseAlerts([...makeAlerts()].reverse()))
    expect(rows[0]).toEqual(['2026-10-01 14:30', 'EF3A', 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu'])
    expect(rows[1][2]).toBe('WATCH: Geomagnetic Storm Category G1 Predicted')
  })

  it('caps the list at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...makeAlerts()[0], issue_datetime: `2026-10-01 10:${String(i).padStart(2, '0')}:00.000` }))
    expect(alertsTable(parseAlerts(many)).rows).toHaveLength(8)
  })

  it('falls back to the first line when a message has no issue time', () => {
    const { rows } = alertsTable(parseAlerts([{ product_id: 'X', issue_datetime: '2026-10-01 00:00:00.000', message: 'Just text' }]))
    expect(rows[0][2]).toBe('Just text')
  })
})

describe('solarWindTable', () => {
  it('samples every fifth minute of the active spacecraft', () => {
    const table = solarWindTable(parseSolarWind(makeSolarWindRows(12)))
    expect(table.caption).toContain('SOLAR1')
    expect(table.rows.map((r) => r[0])).toEqual(['17:44', '17:39', '17:34'])
    expect(table.rows[0]).toEqual(['17:44', '430', '7.9', '129322', 'n/a', 'n/a'])
  })

  it('joins the magnetometer readings on by minute', () => {
    const mag = parseSolarWindMag(makeSolarWindMagRows(12)).filter((m) => m.time_tag !== '2026-10-01T17:39:00')
    const table = solarWindTable(parseSolarWind(makeSolarWindRows(12)), mag)
    expect(table.columns.slice(-2)).toEqual(['Bt (nT)', 'Bz GSM (nT)'])
    expect(table.rows[0].slice(-2)).toEqual(['6.39', '-2'])
    expect(table.rows[1].slice(-2)).toEqual(['n/a', 'n/a'])
    expect(table.rows[2].slice(-2)).toEqual(['6.39', '-12'])
  })

  it('handles a file with no active readings', () => {
    const table = solarWindTable([])
    expect(table.rows).toEqual([])
    expect(table.caption).toContain('no active spacecraft')
  })
})

describe('xraysTable', () => {
  it('pivots the two bands by minute and adds a flare class', () => {
    const table = xraysTable(parseXrays(makeXrayRows(6)))
    expect(table.caption).toContain('GOES-18')
    expect(table.rows[0]).toEqual(['17:44', '2.40e-7', 'B2.4', '1.00e-9'])
    expect(table.rows).toHaveLength(2)
  })

  it('shows n/a for a missing flux', () => {
    const rows = parseXrays([{ time_tag: '2026-10-01T17:44:00Z', satellite: 18, flux: null, energy: '0.1-0.8nm' }])
    expect(xraysTable(rows).rows[0]).toEqual(['17:44', 'n/a', 'n/a', 'n/a'])
  })
})

describe('flareClass', () => {
  it('maps flux to the A, B, C, M and X classes', () => {
    expect(flareClass(5e-9)).toBe('A0.5')
    expect(flareClass(2.4e-7)).toBe('B2.4')
    expect(flareClass(1e-6)).toBe('C1.0')
    expect(flareClass(3.2e-5)).toBe('M3.2')
    expect(flareClass(1.5e-4)).toBe('X1.5')
  })
})

describe('SWPC_TRY_ITS', () => {
  it('runs one loader per node, the alerts node returning scales and alerts', async () => {
    expect(Object.keys(SWPC_TRY_ITS).sort()).toEqual(['swpc-alerts-scales', 'swpc-goes-space-environment', 'swpc-rtsw-solar-wind'])
    expect(await SWPC_TRY_ITS['swpc-alerts-scales']?.()).toHaveLength(2)
    const [wind] = (await SWPC_TRY_ITS['swpc-rtsw-solar-wind']?.()) ?? []
    expect(wind.rows[0].slice(-2)).toEqual(['6.39', '-2'])
  })
})
