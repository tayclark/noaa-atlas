import { describe, expect, it } from 'vitest'
import { SpcHttpError, SpcParseError } from '../../data/spcClient'
import { makeSpcOutlook } from '../../data/spcFixtures'
import {
  categoriesInOutlook,
  describeOutlookForPopup,
  describeSpcFetchOutcome,
  formatOutlookPopupHtml,
  isOutlookEmpty,
} from './spcOutlookLayer'

describe('categoriesInOutlook', () => {
  it('lists only the present categories, lowest risk first', () => {
    const outlook = makeSpcOutlook()
    outlook.features.reverse()
    expect(categoriesInOutlook(outlook).map((c) => c.label)).toEqual(['TSTM', 'MRGL'])
  })
})

describe('isOutlookEmpty', () => {
  it('is true only without features', () => {
    expect(isOutlookEmpty({ type: 'FeatureCollection', features: [] })).toBe(true)
    expect(isOutlookEmpty(makeSpcOutlook())).toBe(false)
  })
})

describe('describeOutlookForPopup', () => {
  it('names the category, window and forecaster', () => {
    const content = describeOutlookForPopup(makeSpcOutlook().features[1].properties)
    expect(content.title).toBe('Marginal Risk')
    expect(content.forecaster).toBe('Guyer/Bentley')
    expect(content.valid).toBe(new Date('2026-10-01T13:00:00+00:00').toLocaleString())
  })

  it('escapes feed text in the popup html', () => {
    const properties = { ...makeSpcOutlook().features[0].properties, LABEL2: '<b>Risk</b>', FORECASTER: undefined }
    const html = formatOutlookPopupHtml(properties)
    expect(html).toContain('&lt;b&gt;Risk&lt;/b&gt;')
    expect(html).not.toContain('Forecaster')
  })
})

describe('describeSpcFetchOutcome', () => {
  it('words each failure kind', () => {
    expect(describeSpcFetchOutcome(new SpcHttpError(503))).toMatch(/unavailable/)
    expect(describeSpcFetchOutcome(new SpcParseError('x', null))).toMatch(/unexpected/)
    expect(describeSpcFetchOutcome(new TypeError('Failed to fetch'))).toMatch(/Could not reach SPC/)
    expect(describeSpcFetchOutcome(new Error('boom'))).toMatch(/Something went wrong/)
  })
})
