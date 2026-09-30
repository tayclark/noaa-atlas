// Text and UI colour contrast for the dark theme's design tokens (#47), so a token edit that
// drops below WCAG AA fails here rather than in a reviewer's eyes. Reads the tokens straight from
// index.css, which is their single source.

import { describe, expect, it } from 'vitest'
import css from './index.css?raw'

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`))
  if (!match) throw new Error(`Token --${name} not found as a 6-digit hex colour in index.css`)
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = ['color-bg', 'color-surface', 'color-surface-raised'] as const

describe('contrastRatio', () => {
  it('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe('design token contrast (WCAG AA)', () => {
  // Body-size text needs 4.5:1; the accent doubles as link/label text, the alert colours as text.
  const TEXT = ['color-text', 'color-text-muted', 'color-accent', 'color-alert-warning', 'color-alert-danger'] as const

  for (const foreground of TEXT) {
    for (const surface of SURFACES) {
      it(`--${foreground} on --${surface} is at least 4.5:1`, () => {
        expect(contrastRatio(token(foreground), token(surface))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('the focus ring (--color-accent) is at least 3:1 against every surface', () => {
    for (const surface of SURFACES) {
      expect(contrastRatio(token('color-accent'), token(surface))).toBeGreaterThanOrEqual(3)
    }
  })
})
