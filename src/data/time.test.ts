import { describe, expect, it } from 'vitest'
import { HOUR_MS, utcYmd } from './time'

describe('utcYmd', () => {
  it('formats the UTC day, not the local one', () => {
    expect(utcYmd(Date.parse('2026-10-01T23:59:00Z'))).toBe('20261001')
    expect(utcYmd(Date.parse('2026-01-05T00:00:00Z') - HOUR_MS)).toBe('20260104')
  })
})
