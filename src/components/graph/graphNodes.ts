// The graph's nodes as the detail views see them: services, theme hubs and the NOAA root, parsed
// and built once (#30, #78).

import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'

const graphNodes = buildGraph(parseGraphFile(graphJson)).nodes

export type DetailNode = (typeof graphNodes)[number]

/** The graph node with this id, or undefined for none (or an id that isn't a graph node). */
export function findGraphNode(id: string | null): DetailNode | undefined {
  return id ? graphNodes.find((node) => node.id === id) : undefined
}
