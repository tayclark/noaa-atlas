import { themeNodeId } from './buildGraph'
import { THEMES, type Graph, type ServiceNode, type Theme } from './graphSchema'
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

export interface RootSummary {
  themes: { theme: Theme; services: number; live: number }[]
  services: number
  live: number
}

/** Per-theme and total service counts, for the NOAA root's detail panel (#148). */
export function summarizeRoot(graph: Graph): RootSummary {
  const themes = THEMES.map((theme) => {
    const { services, live } = summarizeTheme(graph, theme)
    return { theme, services: services.length, live }
  })
  return {
    themes,
    services: themes.reduce((sum, t) => sum + t.services, 0),
    live: themes.reduce((sum, t) => sum + t.live, 0),
  }
}
