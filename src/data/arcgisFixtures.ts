import type { ArcgisLegend } from './arcgisSchema'

// Trimmed copy of the real obs/rfc_qpe MapServer /legend?f=json (curled 2026-10-01): the swatch is a
// 1x1 transparent PNG standing in for the real 20x20 images.
const SWATCH =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Trimmed copy of the real outlooks/cpc_6_10_day_outlk MapServer legend (curled 2026-10-02).
export function makeArcgisVectorLegend(): ArcgisLegend {
  return {
    layers: [
      {
        layerId: 0,
        layerName: 'CPC 6-10 Day Temperature Outlook',
        legend: [
          { label: 'Above, 90%', imageData: SWATCH, contentType: 'image/png' },
          { label: 'Below, 40%', imageData: SWATCH, contentType: 'image/png' },
        ],
      },
    ],
  }
}

export function makeArcgisLegend(): ArcgisLegend {
  return {
    layers: [
      { layerId: 2, layerName: 'Boundary', legend: [{ label: '', imageData: SWATCH, contentType: 'image/png' }] },
      {
        layerId: 28,
        layerName: 'Image',
        legend: [
          { label: 'Greater than or equal to 10', imageData: SWATCH, contentType: 'image/png' },
          { label: '0.1  to  0.25', imageData: SWATCH, contentType: 'image/png' },
          { label: 'Missing data', imageData: SWATCH, contentType: 'image/png' },
        ],
      },
    ],
  }
}
