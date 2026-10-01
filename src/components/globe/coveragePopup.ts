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

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The popup's list of covering APIs. The live ones are listed, since those are the ones that do
 * something here; the rest, which can be most of thirty, fold into one line to open (#78). A point
 * in the US is covered by about thirty services, and listing each with its reason made a popup
 * thousands of pixels tall; the reasons are in each service's detail.
 */
export function formatCoveragePopupHtml(entries: readonly CoverageEntry[]): string {
  if (entries.length === 0) {
    return '<span style="opacity: 0.7">No APIs cover this location.</span>'
  }

  const live = entries.filter((entry) => entry.status === 'live')
  const rest = entries.filter((entry) => entry.status !== 'live')
  const liveItems = live.map((entry) => `<li><strong>${escapeHtml(entry.name)}</strong> — live</li>`).join('')
  const restItems = rest.map((entry) => `<li>${escapeHtml(entry.name)}</li>`).join('')
  const more = rest.length
    ? `<details class="coverage-more"><summary>${live.length ? `${rest.length} more` : rest.length} available, not live yet</summary><ul>${restItems}</ul></details>`
    : ''

  return `<strong>APIs covering this point</strong>${
    live.length ? `<ul class="coverage-live">${liveItems}</ul>` : ''
  }${more}`
}
