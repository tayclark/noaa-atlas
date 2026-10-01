import type { SpcOutlook, SpcOutlookFeature } from './spcSchema'

// Trimmed copies of the real day1otlk_cat.nolyr.geojson features (curled 2026-10-01).

export function makeSpcFeature(
  label: string,
  label2: string,
  fill: string,
  stroke: string,
  ring: [number, number][],
): SpcOutlookFeature {
  return {
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
    properties: {
      LABEL: label,
      LABEL2: label2,
      fill,
      stroke,
      VALID_ISO: '2026-10-01T13:00:00+00:00',
      EXPIRE_ISO: '2026-10-02T12:00:00+00:00',
      FORECASTER: 'Guyer/Bentley',
    },
  }
}

export function makeSpcOutlook(): SpcOutlook {
  return {
    type: 'FeatureCollection',
    features: [
      makeSpcFeature('TSTM', 'General Thunderstorms Risk', '#C1E9C1', '#55BB55', [[-100, 31], [-100, 40], [-85, 40], [-85, 31], [-100, 31]]),
      makeSpcFeature('MRGL', 'Marginal Risk', '#7DC57D', '#005500', [[-98, 33], [-98, 38], [-90, 38], [-90, 33], [-98, 33]]),
    ],
  }
}
