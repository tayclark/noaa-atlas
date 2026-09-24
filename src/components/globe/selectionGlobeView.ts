// What the globe shows for the current selection (#149): the coverage footprint to draw, where to
// fly, and the status card's text. Replaces nodeSelectionStatus.ts (#44), which only flew to a
// selected service and never drew anything, so the graph→globe link was invisible. Pure, so it's
// unit-tested; MapLibreGlobe.tsx just applies the result.

import { THEME_ID_PREFIX, THEME_LABELS, THEMES, type Coverage, type ServiceNode, type Theme } from '../../data/graphSchema'
import type { LonLat } from '../../data/coverageLookup'
import type { Selection } from '../../data/selectionStore'
import type { Task } from '../../data/taskSchema'
import { THEME_COLORS } from '../../data/themeColors'
import { coverageFlyTarget, type FlyTarget } from './coverageFlyTarget'

export interface FootprintProperties {
  nodeId: string
  color: string
}

// Declared here rather than imported from 'geojson': pulling @types/geojson into the program
// tightens maplibre-gl's own GeoJSON typings and breaks the alerts source's existing types.
export interface Footprint {
  type: 'FeatureCollection'
  features: { type: 'Feature'; geometry: Coverage; properties: FootprintProperties }[]
}

export interface SelectionGlobeView {
  /** Coverage of every service the selection stands for, coloured by theme. Empty for a point. */
  footprint: Footprint
  /** Null when the globe should stay where it is (a point, or nothing to frame). */
  flyTarget: FlyTarget | null
  /** Whether the live alerts layer should be emphasised. */
  liveHighlighted: boolean
  card: { title: string; lines: string[]; colors: string[] } | null
}

export interface GlobeViewContext {
  nodes: readonly ServiceNode[]
  tasks: readonly Task[]
  /** Services covering the selected point, when a point is selected. */
  nodesAtPoint: (point: LonLat) => readonly ServiceNode[]
}

const EMPTY: SelectionGlobeView = {
  footprint: { type: 'FeatureCollection', features: [] },
  flyTarget: null,
  liveHighlighted: false,
  card: null,
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** "Coverage of its API" for one, "Coverage of its 3 APIs" for more. */
const coverageOfIts = (n: number, one: string, many: string) => `Coverage of its ${n === 1 ? one : `${n} ${many}`}`

function themeOfHub(id: string): Theme | undefined {
  if (!id.startsWith(THEME_ID_PREFIX)) return undefined
  return THEMES.find((theme) => theme === id.slice(THEME_ID_PREFIX.length))
}

function footprintOf(services: readonly ServiceNode[]): Footprint {
  return {
    type: 'FeatureCollection',
    features: services.map((node) => ({
      type: 'Feature',
      geometry: node.coverage,
      properties: { nodeId: node.id, color: THEME_COLORS[node.theme] },
    })),
  }
}

/** One line saying what's outlined, which depends on whether it could be framed at all. */
function coverageLine(target: FlyTarget | null, what: string): string {
  return target?.kind === 'global' ? `${what} worldwide, so the whole globe is tinted.` : `${what} outlined on the globe.`
}

export function describeSelectionForGlobe(selection: Selection, context: GlobeViewContext): SelectionGlobeView {
  const byId = new Map(context.nodes.map((node) => [node.id, node]))

  if (selection.selectedPoint) {
    const count = context.nodesAtPoint(selection.selectedPoint).length
    return {
      ...EMPTY,
      card: {
        title: 'Selected point',
        lines: [`${plural(count, 'API covers', 'APIs cover')} this spot, highlighted in the graph.`],
        colors: [],
      },
    }
  }

  if (selection.selectedTaskId) {
    const task = context.tasks.find((t) => t.id === selection.selectedTaskId)
    if (!task) return EMPTY
    const services = task.nodes.map((n) => byId.get(n.nodeId)).filter((n): n is ServiceNode => n !== undefined)
    return viewOf(task.label, services, coverageOfIts(services.length, 'API', 'APIs'))
  }

  const id = selection.selectedNodeId
  if (!id) return EMPTY

  const theme = themeOfHub(id)
  if (theme) {
    const services = context.nodes.filter((n) => n.theme === theme)
    if (services.length === 0) {
      return { ...EMPTY, card: { title: THEME_LABELS[theme], lines: ['No services curated yet.'], colors: [] } }
    }
    return viewOf(THEME_LABELS[theme], services, coverageOfIts(services.length, 'service', 'services'))
  }

  const node = byId.get(id)
  if (!node) return EMPTY
  const view = viewOf(node.name, [node], 'Coverage')
  // notLiveReason already reads as a sentence ("Not wired into the v1 map: …"), so it's shown as is.
  const status = node.liveLayer ? 'Its live layer, active alerts, is highlighted.' : (node.notLiveReason ?? 'Not live on the map yet.')
  return { ...view, card: view.card && { ...view.card, lines: [...view.card.lines, status] } }
}

function viewOf(title: string, services: readonly ServiceNode[], what: string): SelectionGlobeView {
  const flyTarget = coverageFlyTarget(services.map((n) => n.coverage))
  return {
    footprint: footprintOf(services),
    flyTarget,
    liveHighlighted: services.some((n) => n.liveLayer),
    card: {
      title,
      lines: [coverageLine(flyTarget, what)],
      colors: [...new Set(services.map((n) => THEME_COLORS[n.theme]))],
    },
  }
}
