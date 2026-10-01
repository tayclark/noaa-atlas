// Pure rows for the Compare tab (#76): one labelled row per comparable field, with one cell per
// service in the order given. Reuses the detail panel's formatters so both views read the same.

import { summarizeCoverage } from '../../data/coverageSummary'
import type { ServiceNode } from '../../data/graphSchema'
import { formatAuth, formatFormats, formatFreshness, formatOwner, formatRateLimits } from './nodeDetailFormat'

export interface CompareRow {
  label: string
  cells: string[]
}

const FIELDS: { label: string; format: (node: ServiceNode) => string }[] = [
  { label: 'Auth', format: (node) => formatAuth(node.auth) },
  { label: 'Formats', format: (node) => formatFormats(node.formats) },
  { label: 'Coverage', format: (node) => summarizeCoverage(node.coverage) },
  { label: 'Freshness', format: (node) => formatFreshness(node.freshness) },
  { label: 'Rate limits', format: (node) => formatRateLimits(node.rateLimits) },
  { label: 'Owner', format: (node) => formatOwner(node.owner) },
]

export function buildCompareRows(nodes: readonly ServiceNode[]): CompareRow[] {
  return FIELDS.map(({ label, format }) => ({ label, cells: nodes.map(format) }))
}
