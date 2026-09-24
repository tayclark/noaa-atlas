// Detail panel body for a theme hub (#145): what the theme covers and which services sit under
// it. Service rows select the service, like the neighbour buttons in NodeNeighborsSection.

import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile, THEME_DESCRIPTIONS, type ThemeNode } from '../../data/graphSchema'
import { selectNode } from '../../data/selectionStore'
import { THEME_COLORS } from '../../data/themeColors'
import { summarizeTheme } from '../../data/themeSummary'

const graph = buildGraph(parseGraphFile(graphJson))

export function ThemeDetailBody({ node }: { node: ThemeNode }) {
  const { services, live } = summarizeTheme(graph, node.theme)

  return (
    <>
      <span className="node-detail-theme-tag">
        <span className="node-detail-theme-swatch" style={{ background: THEME_COLORS[node.theme] }} aria-hidden="true" />
        Theme
      </span>
      <p className="node-detail-theme-description">{THEME_DESCRIPTIONS[node.theme]}</p>
      {services.length === 0 ? (
        <p className="node-detail-theme-empty">No services curated yet.</p>
      ) : (
        <section className="node-detail-theme-services" aria-label="Services">
          <h4>
            {services.length} {services.length === 1 ? 'service' : 'services'} · {live} live
          </h4>
          <ul>
            {services.map((service) => (
              <li key={service.id}>
                <button type="button" onClick={() => selectNode(service.id)}>
                  {service.name}
                </button>
                {service.liveLayer && <span className="node-detail-theme-live">Live</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
