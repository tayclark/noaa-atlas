import { describe, expect, it } from 'vitest'
import { escapeHtml } from './popupHtml'

describe('escapeHtml', () => {
  it('escapes markup and attribute-breaking characters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)> & "q"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;')
  })

  it('escapes an existing entity rather than passing it through', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Partly Sunny, 10 mph')).toBe('Partly Sunny, 10 mph')
  })
})
