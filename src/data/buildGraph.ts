import {
  THEME_ID_PREFIX,
  THEME_LABELS,
  THEMES,
  type Graph,
  type GraphEdge,
  type GraphFile,
  type Theme,
  type ThemeNode,
} from './graphSchema'

export const themeNodeId = (theme: Theme) => `${THEME_ID_PREFIX}${theme}`

/** Adds one hub per theme and one derived theme edge per service to the authored file. */
export function buildGraph(file: GraphFile): Graph {
  const hubs: ThemeNode[] = THEMES.map((theme) => ({
    id: themeNodeId(theme),
    kind: 'theme',
    name: THEME_LABELS[theme],
    theme,
  }))

  const themeEdges: GraphEdge[] = file.nodes.map((node) => ({
    source: node.id,
    target: themeNodeId(node.theme),
    type: 'theme',
    label: THEME_LABELS[node.theme],
  }))

  return {
    nodes: [...hubs, ...file.nodes],
    edges: [...themeEdges, ...file.edges],
  }
}
