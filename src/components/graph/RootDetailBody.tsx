// Detail panel body for the NOAA root (#148): what the atlas is and how its services split across
// the themes. Theme rows select the theme hub, like the service rows in ThemeDetailBody.

import graphJson from '../../data/graph.json'
import { buildGraph, themeNodeId } from '../../data/buildGraph'
import { parseGraphFile, THEME_LABELS, type Graph } from '../../data/graphSchema'
import { selectNode } from '../../data/selectionStore'
import { THEME_COLORS } from '../../data/themeColors'
import { summarizeRoot } from '../../data/themeSummary'

const defaultGraph = buildGraph(parseGraphFile(graphJson))

/** `graph` is only overridden by tests, to reach the empty-theme state. */
export function RootDetailBody({ graph = defaultGraph }: { graph?: Graph }) {
  const { themes, services, live } = summarizeRoot(graph)

  return (
    <>
      <p className="node-detail-theme-description">
        A curated map of NOAA&apos;s public data services, grouped by theme. Pick a theme or a service to see what it
        offers and where it covers on the globe.
      </p>
      <section className="node-detail-theme-services" aria-label="Themes">
        <h4>
          {services} services · {live} live
        </h4>
        <ul>
          {themes.map(({ theme, services: count }) => (
            <li key={theme}>
              <span className="node-detail-theme-swatch" style={{ background: THEME_COLORS[theme] }} aria-hidden="true" />
              <button type="button" onClick={() => selectNode(themeNodeId(theme))}>
                {THEME_LABELS[theme]}
              </button>
              <span className="node-detail-root-count">{count === 0 ? 'none yet' : count}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
