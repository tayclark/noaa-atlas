// Org view (#58): NOAA → line office → program → service. The hubs are derived from each service's
// `owner`, like the theme hubs, and kept out of `Graph` because they are render-only.
import {
  OFFICE_ID_PREFIX,
  OFFICE_LABELS,
  PROGRAM_ID_PREFIX,
  ROOT_NODE_ID,
  type GraphEdge,
  type GraphFile,
  type Office,
  type OfficeNode,
  type OrgNode,
  type ProgramNode,
  type ServiceNode,
} from './graphSchema'

export const officeNodeId = (office: Office) => `${OFFICE_ID_PREFIX}${office.toLowerCase()}`

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const programKey = (node: ServiceNode) => `${node.owner.office}|${node.owner.programGroup}`
export const programNodeId = (node: ServiceNode) =>
  `${PROGRAM_ID_PREFIX}${node.owner.office.toLowerCase()}-${slugify(node.owner.programGroup ?? '')}`

export interface OrgHierarchy {
  nodes: OrgNode[]
  edges: GraphEdge[]
}

/**
 * One hub per office that owns a service, and one per `programGroup` shared by two or more
 * services in the same office (a lone group is not worth a tier). Services link to their program
 * hub, or straight to their office; program hubs link to the office, and offices to the root.
 */
export function buildOrgHierarchy(file: GraphFile): OrgHierarchy {
  const groupSizes = new Map<string, number>()
  for (const node of file.nodes) {
    if (node.owner.programGroup) groupSizes.set(programKey(node), (groupSizes.get(programKey(node)) ?? 0) + 1)
  }
  const hasProgramHub = (node: ServiceNode) => node.owner.programGroup !== undefined && (groupSizes.get(programKey(node)) ?? 0) >= 2

  const offices = new Map<Office, OfficeNode>()
  const programs = new Map<string, ProgramNode>()
  const edges: GraphEdge[] = []
  for (const node of file.nodes) {
    const { office } = node.owner
    if (!offices.has(office)) {
      offices.set(office, { id: officeNodeId(office), kind: 'office', name: OFFICE_LABELS[office], office })
      edges.push({ source: officeNodeId(office), target: ROOT_NODE_ID, type: 'org', label: 'NOAA' })
    }
    if (hasProgramHub(node)) {
      const id = programNodeId(node)
      if (!programs.has(id)) {
        programs.set(id, { id, kind: 'program', name: node.owner.programGroup as string, office })
        edges.push({ source: id, target: officeNodeId(office), type: 'org', label: OFFICE_LABELS[office] })
      }
      edges.push({ source: node.id, target: id, type: 'org', label: node.owner.programGroup as string })
    } else {
      edges.push({ source: node.id, target: officeNodeId(office), type: 'org', label: OFFICE_LABELS[office] })
    }
  }
  return { nodes: [...offices.values(), ...programs.values()], edges }
}
