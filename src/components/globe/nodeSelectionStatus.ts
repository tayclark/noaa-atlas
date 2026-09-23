// Pure helper for the globe's reaction to a graph node selection (#44). Kept out of
// MapLibreGlobe.tsx so the fly-to bounds and status message logic is unit-testable —
// MapLibreGlobe.tsx itself is excluded from coverage and verified manually in the browser
// (see vite.config.ts), matching coveragePopup.ts's precedent.

import { coverageBbox } from '../../data/coverageSummary'
import type { ServiceNode } from '../../data/graphSchema'

export interface NodeSelectionStatus {
  bounds: [number, number, number, number]
  message: string
}

/** Bounds to fly the globe to, plus a status message: the live-layer note, or notLiveReason. */
export function describeNodeSelectionForGlobe(node: ServiceNode): NodeSelectionStatus {
  return {
    bounds: coverageBbox(node.coverage),
    message: node.liveLayer ? 'Live layer highlighted below.' : (node.notLiveReason ?? ''),
  }
}
