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
