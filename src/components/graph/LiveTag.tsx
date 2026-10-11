// A service's live status as a badge, in the wide detail card and the phone's sheet (#30, #78).

import type { ServiceNode } from '../../data/graphSchema'
import { liveStatusLabel } from './nodeDetailFormat'

export function LiveTag({ node }: { node: ServiceNode }) {
  return <span className={`node-detail-live-tag ${node.liveLayer ? 'node-detail-live' : 'node-detail-not-live'}`}>{liveStatusLabel(node)}</span>
}
