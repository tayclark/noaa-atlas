// Legend for the theme/edge-type styling added in #29. No props — THEMES/edge types are fixed
// enumerations already imported at module scope elsewhere in this codebase (see GraphView.tsx's
// own graph.json import), so a props API would just forward constants the caller already has.
import type { GraphEdge } from '../../data/graphSchema'
import { THEME_LABELS, THEMES } from '../../data/graphSchema'
import { ROOT_COLOR, THEME_COLORS } from '../../data/themeColors'
import { EDGE_CLASS, EDGE_TYPE_LABELS } from './graphLayout'
import './GraphLegend.css'

const EDGE_TYPES: GraphEdge['type'][] = ['root', 'theme', 'shared-id', 'data-flow']

// Node sizes, halved from nodeRadius so they fit the legend row (#148).
const NODE_KEYS = [
  { label: 'NOAA, the root everything stems from', radius: 7, color: ROOT_COLOR },
  { label: 'Theme hub', radius: 5, color: THEME_COLORS.weather },
  { label: 'API or data service', radius: 3, color: THEME_COLORS.weather },
]

export function GraphLegend() {
  return (
    <div className="graph-legend" id="graph-legend" aria-label="Legend">
      <div className="graph-legend-group">
        <h3>Nodes</h3>
        <ul className="graph-legend-edges">
          {NODE_KEYS.map(({ label, radius, color }) => (
            <li key={label}>
              <svg className="graph-legend-edge" width="20" height="14" aria-hidden="true">
                <circle cx="10" cy="7" r={radius} style={{ fill: color }} />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="graph-legend-group">
        <h3>Themes</h3>
        <ul className="graph-legend-themes">
          {THEMES.map((theme) => (
            <li key={theme}>
              <span className="graph-legend-swatch" style={{ background: THEME_COLORS[theme] }} />
              {THEME_LABELS[theme]}
            </li>
          ))}
        </ul>
      </div>
      <div className="graph-legend-group">
        <h3>Links</h3>
        <ul className="graph-legend-edges">
          {EDGE_TYPES.map((type) => (
            <li key={type}>
              <svg className="graph-legend-edge" width="20" height="8" aria-hidden="true">
                <line className={`graph-edge ${EDGE_CLASS[type]}`} x1="0" y1="4" x2="20" y2="4" />
              </svg>
              {EDGE_TYPE_LABELS[type]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
