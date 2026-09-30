// Pure display helpers for NodeDetailPanel.tsx (#30), kept testable and out of JSX. Mirrors
// coveragePopup.ts's live/not-live labeling convention rather than importing it — that module's
// exports are shaped around a list of covering nodes for a globe popup, not a single selected
// node's detail fields.

import type { ServiceNode } from '../../data/graphSchema'

const CADENCE_LABELS: Record<ServiceNode['freshness']['cadence'], string> = {
  realtime: 'Real-time',
  minutes: 'Every few minutes',
  hourly: 'Hourly',
  daily: 'Daily',
  periodic: 'Periodic',
  static: 'Static',
}

const AUTH_LABELS: Record<ServiceNode['auth']['type'], string> = {
  none: 'None required',
  token: 'Token required',
  key: 'API key required',
}

export function formatOwner(owner: ServiceNode['owner']): string {
  return `${owner.office} — ${owner.program}`
}

export function formatFormats(formats: ServiceNode['formats']): string {
  return formats.join(', ')
}

export function formatAuth(auth: ServiceNode['auth']): string {
  return auth.note ? `${AUTH_LABELS[auth.type]} (${auth.note})` : AUTH_LABELS[auth.type]
}

export function formatRateLimits(rateLimits: ServiceNode['rateLimits']): string {
  return rateLimits?.text ?? 'Not specified'
}

export function formatFreshness(freshness: ServiceNode['freshness']): string {
  return freshness.note ? `${CADENCE_LABELS[freshness.cadence]} (${freshness.note})` : CADENCE_LABELS[freshness.cadence]
}

export function liveStatusLabel(node: ServiceNode): string {
  return node.liveLayer ? 'Live' : 'Available, not live yet'
}

const DATASET_FREQUENCY_LABELS: Record<string, string> = {
  asNeeded: 'As needed',
  notPlanned: 'Not planned',
  irregular: 'Irregular',
  continual: 'Continual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Twice a year',
  annually: 'Annually',
}

/** NCEI sends raw ISO 19115 codes, plus one mangled value that starts with `irregular` (#70). */
export function formatDatasetFrequency(raw: string | null): string | null {
  if (!raw) return null
  const label = DATASET_FREQUENCY_LABELS[raw]
  if (label) return label
  return raw.startsWith('irregular') ? 'Irregular' : null
}

export function formatDatasetRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} to ${end}`
  if (start) return `From ${start}`
  if (end) return `Until ${end}`
  return null
}

/** The snapshot's `doi` field is a full URL, and some rows point at NCEI's metadata page instead. */
export function datasetLink(url: string | null): { href: string; label: string } | null {
  if (!url?.startsWith('https://')) return null
  return { href: url, label: url.startsWith('https://doi.org/') ? 'DOI ↗' : 'Metadata ↗' }
}
