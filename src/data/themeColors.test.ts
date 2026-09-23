import { describe, expect, it } from 'vitest'
import { THEMES } from './graphSchema'
import { THEME_COLORS, themeColor } from './themeColors'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

describe('THEME_COLORS', () => {
  it('has exactly one valid hex color per theme', () => {
    for (const theme of THEMES) {
      expect(THEME_COLORS[theme]).toMatch(HEX_COLOR)
    }
    expect(Object.keys(THEME_COLORS)).toHaveLength(THEMES.length)
  })

  it('assigns every theme a distinct color', () => {
    const colors = THEMES.map((theme) => THEME_COLORS[theme])
    expect(new Set(colors).size).toBe(THEMES.length)
  })
})

describe('themeColor', () => {
  it('returns the same color as the THEME_COLORS map', () => {
    for (const theme of THEMES) {
      expect(themeColor(theme)).toBe(THEME_COLORS[theme])
    }
  })
})
