import { describe, expect, it } from 'vitest'
import { dartStationsToGeoJSON, formatDartPopupHtml } from './dartStationsLayer'

describe('dartStationsToGeoJSON', () => {
  it('emits [lng, lat] points carrying the id and name', () => {
    const fc = dartStationsToGeoJSON([{ id: '21414', name: 'AMCHITKA', lat: 48.977, lng: 178.199 }])
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      properties: { id: '21414', name: 'AMCHITKA' },
      geometry: { type: 'Point', coordinates: [178.199, 48.977] },
    })
  })
})

describe('formatDartPopupHtml', () => {
  it('names the buoy and links its NDBC page', () => {
    const html = formatDartPopupHtml({ id: '21414', name: 'AMCHITKA' })
    expect(html).toContain('AMCHITKA')
    expect(html).toContain('station_page.php?station=21414')
  })

  it('escapes the name', () => {
    expect(formatDartPopupHtml({ id: '1', name: '<b>x</b>' })).not.toContain('<b>x</b>')
  })
})
