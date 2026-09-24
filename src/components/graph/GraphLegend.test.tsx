// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_LABELS, THEMES } from '../../data/graphSchema'
import { THEME_COLORS } from '../../data/themeColors'
import { GraphLegend } from './GraphLegend'
import { EDGE_CLASS, EDGE_TYPE_LABELS } from './graphLayout'

afterEach(cleanup)

describe('GraphLegend', () => {
  it('renders a labeled swatch for every theme', () => {
    render(<GraphLegend />)
    for (const theme of THEMES) {
      const label = screen.getByText(THEME_LABELS[theme])
      const row = label.closest('li')
      const swatch = row?.querySelector<HTMLElement>('.graph-legend-swatch')
      expect(swatch?.style.background).toBe(hexToRgb(THEME_COLORS[theme]))
    }
  })

  it('explains the three node sizes, root first', () => {
    render(<GraphLegend />)
    const radii = ['NOAA, the root everything stems from', 'Theme hub', 'API or data service'].map((label) =>
      Number(screen.getByText(label).closest('li')?.querySelector('circle')?.getAttribute('r')),
    )
    expect(radii).toEqual([...radii].sort((a, b) => b - a))
  })

  it('renders a labeled key for every edge type', () => {
    render(<GraphLegend />)
    for (const type of ['root', 'theme', 'shared-id', 'data-flow'] as const) {
      const label = screen.getByText(EDGE_TYPE_LABELS[type])
      const row = label.closest('li')
      const line = row?.querySelector('line')
      expect(line?.getAttribute('class')).toBe(`graph-edge ${EDGE_CLASS[type]}`)
    }
  })
})

// jsdom normalizes inline `style.background` hex values to rgb(); compare against that form
// rather than the raw hex string.
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}
