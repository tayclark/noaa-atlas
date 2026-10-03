import { describe, expect, it, vi } from 'vitest'
import graphJson from '../../data/graph.json'
import { makeHtfAnnual, makeSeaLevelTrend, makeStationMetadata } from '../../data/coopsFixtures'
import { parseHtfAnnual, parseSeaLevelTrend, parseStationMetadata } from '../../data/coopsSchema'
import { COOPS_TRY_IT_STATION, COOPS_TRY_ITS, datumsTable, floodDaysTable, seaLevelTrendTable, stationTable } from './coopsTryIt'

const trendResult = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('../../data/coopsClient', () => ({
  getStationMetadata: () => Promise.resolve(parseStationMetadata(makeStationMetadata())),
  getSeaLevelTrend: () => Promise.resolve(trendResult.current ?? parseSeaLevelTrend(makeSeaLevelTrend())),
  getHtfAnnual: () => Promise.resolve(parseHtfAnnual(makeHtfAnnual())),
}))

const station = parseStationMetadata(makeStationMetadata())

describe('stationTable', () => {
  it('lists the details and NOS flood levels in metres above station datum', () => {
    const table = stationTable(station)
    expect(table.caption).toBe('Panama City, FL (8729108); flood levels in m above station datum')
    expect(table.rows).toEqual([
      ['Established', '1973-02-11'],
      ['NOAA chart', '11391'],
      ['Minor flood (NOS)', '1.94 m'],
      ['Moderate flood (NOS)', '2.24 m'],
      ['Major flood (NOS)', '2.61 m'],
    ])
  })

  it('says n/a for missing details and flood levels', () => {
    const bare = {
      ...station,
      details: { established: null, noaachart: '' },
      floodlevels: { nos_minor: null, nos_moderate: null, nos_major: null },
    }
    expect(stationTable(bare).rows.map((r) => r[1])).toEqual(['n/a', 'n/a', 'n/a', 'n/a', 'n/a'])
  })
})

describe('datumsTable', () => {
  it('lists each datum with the epoch in the caption', () => {
    const table = datumsTable(station)
    expect(table.caption).toBe('Datums (meters), 1983-2001 epoch')
    expect(table.rows[1]).toEqual(['MHHW', 'Mean Higher-High Water', '1.428'])
  })

  it('leaves the epoch out when the station has none, and shows a missing value as n/a', () => {
    const lake = { ...station, datums: { epoch: null, units: 'meters', datums: [{ name: 'LWD', description: 'Low Water Datum', value: null }] } }
    expect(datumsTable(lake)).toMatchObject({ caption: 'Datums (meters)', rows: [['LWD', 'Low Water Datum', 'n/a']] })
  })
})

describe('seaLevelTrendTable', () => {
  it('shows the trend with its error and the record as year-months', () => {
    const result = parseSeaLevelTrend(makeSeaLevelTrend())
    if (!result.ok) throw new Error('fixture should parse')
    expect(seaLevelTrendTable(result.value)).toEqual({
      caption: 'Sea level trend at Panama City',
      columns: ['Field', 'Value'],
      rows: [
        ['Trend', '3.08 ± 0.26 mm/yr'],
        ['Record', '1973-03 to 2025-12'],
      ],
    })
  })

  it('passes through a date in another format', () => {
    const result = parseSeaLevelTrend(makeSeaLevelTrend())
    if (!result.ok) throw new Error('fixture should parse')
    expect(seaLevelTrendTable({ ...result.value, endDate: '2025' }).rows[1][1]).toBe('1973-03 to 2025')
  })
})

describe('floodDaysTable', () => {
  it('shows the latest ten years newest first, skipping years with no counts', () => {
    const table = floodDaysTable(parseHtfAnnual(makeHtfAnnual()))
    expect(table.caption).toBe('High tide flood days, latest 10 years')
    expect(table.rows.map((r) => r[0])).toEqual(['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'])
    expect(table.rows[2]).toEqual(['2024', '6', '1', '0'])
  })

  it('counts only the years it has and shows a partial year as n/a', () => {
    const years = [
      { year: 1920, minCount: null, modCount: null, majCount: null },
      { year: 2025, minCount: 3, modCount: null, majCount: null },
    ]
    expect(floodDaysTable(years)).toMatchObject({ caption: 'High tide flood days, latest 1 years', rows: [['2025', '3', 'n/a', 'n/a']] })
  })
})

describe('COOPS_TRY_ITS', () => {
  it('runs the metadata node as a station table and a datums table', async () => {
    const tables = await COOPS_TRY_ITS['coops-metadata-api']?.()
    expect(tables?.map((t) => t.caption)).toEqual(['Panama City, FL (8729108); flood levels in m above station datum', 'Datums (meters), 1983-2001 epoch'])
  })

  it('runs the derived node as a trend table and a flood days table', async () => {
    const tables = await COOPS_TRY_ITS['coops-derived-product-api']?.()
    expect(tables?.map((t) => t.caption)).toEqual(['Sea level trend at Panama City', 'High tide flood days, latest 10 years'])
  })

  it("throws CO-OPS's message when the station has no trend", async () => {
    trendResult.current = { ok: false, message: 'CO-OPS has no sea level trend for this station.' }
    await expect(COOPS_TRY_ITS['coops-derived-product-api']?.()).rejects.toThrow('CO-OPS has no sea level trend for this station.')
    trendResult.current = null
  })

  it('keeps both nodes live, with sample urls on the try-it station', () => {
    for (const id of ['coops-metadata-api', 'coops-derived-product-api']) {
      const node = graphJson.nodes.find((n) => n.id === id)
      expect(node?.liveLayer, id).toBe(true)
      expect(node?.sample?.url, id).toContain(COOPS_TRY_IT_STATION)
      expect(node?.sample?.url, id).toContain('units=metric')
    }
  })
})
