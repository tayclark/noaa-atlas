import { themeNodeId } from './buildGraph'
import type { Graph, ServiceNode, Theme } from './graphSchema'
import { getNeighbors } from './neighbors'

export interface ThemeSummary {
  /** The theme's services, sorted by name. */
  services: ServiceNode[]
  live: number
}

/** The services linked to a theme hub, for the hub's detail panel (#145). */
export function summarizeTheme(graph: Graph, theme: Theme): ThemeSummary {
  const services = getNeighbors(graph, themeNodeId(theme))
    .filter((group) => group.type === 'theme')
    .flatMap((group) => group.neighbors.map((n) => n.node))
    .filter((node): node is ServiceNode => node.kind === 'service')
  return { services, live: services.filter((node) => node.liveLayer).length }
}
