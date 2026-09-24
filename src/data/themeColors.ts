// Categorical color mapping for the 10 graph themes (#29). Plain hex constants, not CSS custom
// properties — SVG `fill` is set from JS/inline style on each node, so it can't read CSS vars
// (mirrors ALERT_SEVERITY_COLORS in nwsAlertsLayer.ts). Colors are assigned in THEMES's existing
// fixed order (never re-ordered per-render) and validated with the dataviz skill's
// validate_palette.js against this app's actual graph surface (--color-surface, #111720):
// all 10 pass the adjacent-pair CVD/contrast/lightness/chroma checks. All-pairs (relevant since
// force layout can place any two nodes side by side) can't fully clear at 10 slots — expected
// per the skill's own docs, which cap all-pairs validation at 3-4 slots — so identity here also
// leans on secondary encoding already present in the graph: every node renders its name as a
// text label, and the legend pairs each swatch with its theme label.
import type { GraphNode, Theme } from './graphSchema'
import { THEMES } from './graphSchema'

const PALETTE: string[] = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#0aa3a3', // teal
  '#b06a2e', // brown
]

export const THEME_COLORS: Record<Theme, string> = Object.fromEntries(THEMES.map((theme, i) => [theme, PALETTE[i]])) as Record<Theme, string>

export function themeColor(theme: Theme): string {
  return THEME_COLORS[theme]
}

/** The NOAA root (#148) is neutral, so it doesn't read as an eleventh theme. */
export const ROOT_COLOR = '#dde6f0'

export function nodeColor(node: GraphNode): string {
  return node.kind === 'root' ? ROOT_COLOR : THEME_COLORS[node.theme]
}
