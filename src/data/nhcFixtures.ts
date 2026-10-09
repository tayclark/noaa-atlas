import type { NhcStormData } from './nhcClient'
import type { NhcCone, NhcForecastPoint, NhcPastPoint } from './nhcSchema'

// Trimmed copies of the real NHC_tropical_weather_summary layer queries (curled 2026-10-09, advisory
// 12A for Isaias and 50A for Rachel). Coordinates are rounded and the cone simplified to a few vertices.

export function makePastPoint(bin: string, name: string, type: string, intensity: number, dtg: number, lonLat: [number, number]): NhcPastPoint {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: lonLat },
    properties: { binnumber: bin, stormname: name, stormtype: type, intensity, dtg },
  }
}

export function makeForecastPoint(
  bin: string,
  name: string,
  tau: number,
  validtime: string,
  maxwind: number,
  tcdvlp: string,
  lonLat: [number, number],
  fileDate = 1791572556000,
): NhcForecastPoint {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: lonLat },
    properties: { binnumber: bin, stormname: name, tau, validtime, maxwind, tcdvlp, advisnum: '12A', idp_filedate: fileDate },
  }
}

export function makeCone(bin: string, ring: [number, number][]): NhcCone {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { binnumber: bin } }
}

const RACHEL_FILE_DATE = 1791569895000

export function makeNhcStormData(): NhcStormData {
  return {
    past: {
      type: 'FeatureCollection',
      features: [
        makePastPoint('AT4', 'ISAIAS', 'HU', 70, 2026100806, [-91.5, 23.1]),
        makePastPoint('AT4', 'ISAIAS', 'HU', 75, 2026100812, [-90.6, 23.4]),
        makePastPoint('AT4', 'ISAIAS', 'HU', 80, 2026100818, [-89.8, 23.9]),
        makePastPoint('AT4', 'ISAIAS', 'HU', 85, 2026100900, [-89.0, 24.8]),
        makePastPoint('AT4', 'ISAIAS', 'HU', 90, 2026100906, [-88.4, 25.8]),
        makePastPoint('AT4', 'ISAIAS', 'HU', 105, 2026100912, [-87.6, 27.0]),
        makePastPoint('EP3', 'RACHEL', 'TS', 50, 2026100900, [-125.2, 22.5]),
        makePastPoint('EP3', 'RACHEL', 'TS', 45, 2026100906, [-125.1, 22.5]),
        makePastPoint('EP3', 'RACHEL', 'TS', 45, 2026100912, [-124.9, 22.6]),
      ],
    },
    forecast: {
      type: 'FeatureCollection',
      features: [
        makeForecastPoint('EP3', 'Tropical Storm Rachel', 0, '09/1500', 45, 'Tropical Storm', [-124.5, 23.1], RACHEL_FILE_DATE),
        makeForecastPoint('EP3', 'Tropical Storm Rachel', 12, '10/0000', 45, 'Tropical Storm', [-123.6, 23.4], RACHEL_FILE_DATE),
        makeForecastPoint('EP3', 'Tropical Storm Rachel', 24, '10/1200', 50, 'Tropical Storm', [-121.0, 25.1], RACHEL_FILE_DATE),
        makeForecastPoint('AT4', 'Hurricane Isaias', 0, '09/1500', 105, 'Major Hurricane', [-87.2, 28.4]),
        makeForecastPoint('AT4', 'Hurricane Isaias', 12, '10/0000', 100, 'Major Hurricane', [-86.8, 29.7]),
        makeForecastPoint('AT4', 'Hurricane Isaias', 24, '10/1200', 55, 'Tropical Storm', [-87.1, 32.1]),
      ],
    },
    cones: {
      type: 'FeatureCollection',
      features: [makeCone('AT4', [[-87.6, 28.2], [-86.2, 28.3], [-85.9, 32.4], [-88.4, 32.3], [-87.6, 28.2]])],
    },
  }
}

export function emptyNhcStormData(): NhcStormData {
  return {
    past: { type: 'FeatureCollection', features: [] },
    forecast: { type: 'FeatureCollection', features: [] },
    cones: { type: 'FeatureCollection', features: [] },
  }
}
