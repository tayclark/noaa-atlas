// The graph's nodes as the detail views see them: services, theme hubs and the NOAA root, parsed
// and built once (#30, #78, #270).

import { graph } from '../../data/graphData'

const graphNodes = graph.nodes

export type DetailNode = (typeof graphNodes)[number]

/** The graph node with this id, or undefined for none (or an id that isn't a graph node). */
export function findGraphNode(id: string | null): DetailNode | undefined {
  return id ? graphNodes.find((node) => node.id === id) : undefined
}
