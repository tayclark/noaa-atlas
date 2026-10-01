// Access-method view (#60): NOAA → access method → service. The hubs are derived from each
// service's `accessMethod` and kept out of `Graph` because they are render-only, like the org hubs.
import {
  ACCESS_ID_PREFIX,
  ACCESS_METHOD_LABELS,
  ROOT_NODE_ID,
  type AccessMethod,
  type AccessNode,
  type GraphEdge,
  type GraphFile,
} from './graphSchema'

export const accessNodeId = (method: AccessMethod) => `${ACCESS_ID_PREFIX}${method}`

export interface AccessHierarchy {
  nodes: AccessNode[]
  edges: GraphEdge[]
}

/** One hub per access method in use, linked to the root; each service links to its method's hub. */
export function buildAccessHierarchy(file: GraphFile): AccessHierarchy {
  const hubs = new Map<AccessMethod, AccessNode>()
  const edges: GraphEdge[] = []
  for (const node of file.nodes) {
    const method = node.accessMethod
    if (!hubs.has(method)) {
      hubs.set(method, { id: accessNodeId(method), kind: 'access', name: ACCESS_METHOD_LABELS[method], accessMethod: method })
      edges.push({ source: accessNodeId(method), target: ROOT_NODE_ID, type: 'access', label: 'NOAA' })
    }
    edges.push({ source: node.id, target: accessNodeId(method), type: 'access', label: ACCESS_METHOD_LABELS[method] })
  }
  return { nodes: [...hubs.values()], edges }
}
