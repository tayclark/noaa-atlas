// Pure helpers for the "what APIs cover this point?" click popup (#41). Kept out of
// MapLibreGlobe.tsx so the labeling and formatting logic is unit-testable — MapLibreGlobe.tsx
// itself is excluded from coverage and verified manually in the browser (see vite.config.ts).

import type { ServiceNode } from '../../data/graphSchema'

export interface CoverageEntry {
  name: string
  status: 'live' | 'available, not live yet'
  notLiveReason?: string
}

/** Labels each covering node "live" or "available, not live yet" per #41's AC. */
export function describeCoverageForPopup(nodes: readonly ServiceNode[]): CoverageEntry[] {
  return nodes.map((node) => ({
    name: node.name,
    status: node.liveLayer ? 'live' : 'available, not live yet',
    notLiveReason: node.notLiveReason,
  }))
}

export function formatCoveragePopupHtml(entries: readonly CoverageEntry[]): string {
  if (entries.length === 0) {
    return '<span style="opacity: 0.7">No APIs cover this location.</span>'
  }

  const items = entries
    .map(
      (entry) =>
        `<li><strong>${entry.name}</strong> — ${entry.status}${
          entry.notLiveReason ? ` <span style="opacity: 0.7">(${entry.notLiveReason})</span>` : ''
        }</li>`,
    )
    .join('')

  return `<strong>APIs covering this point</strong><ul style="margin: 4px 0 0; padding-left: 18px">${items}</ul>`
}
