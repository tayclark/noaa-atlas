import {
  ROOT_NODE_ID,
  THEME_ID_PREFIX,
  THEME_LABELS,
  THEMES,
  type Graph,
  type GraphEdge,
  type GraphFile,
  type RootNode,
  type Theme,
  type ThemeNode,
} from './graphSchema'

export const themeNodeId = (theme: Theme) => `${THEME_ID_PREFIX}${theme}`

/**
 * Adds the NOAA root, one hub per theme, one root edge per hub and one derived theme edge per
 * service to the authored file, so every node stems from the root (#148).
 */
export function buildGraph(file: GraphFile): Graph {
  const root: RootNode = { id: ROOT_NODE_ID, kind: 'root', name: 'NOAA' }

  const hubs: ThemeNode[] = THEMES.map((theme) => ({
    id: themeNodeId(theme),
    kind: 'theme',
    name: THEME_LABELS[theme],
    theme,
  }))

  const rootEdges: GraphEdge[] = hubs.map((hub) => ({
    source: hub.id,
    target: ROOT_NODE_ID,
    type: 'root',
    label: 'NOAA',
  }))

  const themeEdges: GraphEdge[] = file.nodes.map((node) => ({
    source: node.id,
    target: themeNodeId(node.theme),
    type: 'theme',
    label: THEME_LABELS[node.theme],
  }))

  return {
    nodes: [root, ...hubs, ...file.nodes],
    edges: [...rootEdges, ...themeEdges, ...file.edges],
  }
}
