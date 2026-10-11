// Adds a service to the Compare tab (#76), or takes it out, from the wide detail card or the phone's
// sheet (#78). Both show the same button: its name stays "Compare" and aria-pressed carries whether
// the service is in the set, so a screen reader hears "Compare, toggle button, pressed" rather than
// a name that changes under the user's finger (#352). The check mark is only for the eye.

import { useSyncExternalStore } from 'react'
import { getCompareSnapshot, subscribeCompare, toggleCompare } from '../../data/compareStore'

export function CompareToggle({ nodeId, className }: { nodeId: string; className?: string }) {
  const compared = useSyncExternalStore(subscribeCompare, getCompareSnapshot).includes(nodeId)
  return (
    <button type="button" className={className} aria-pressed={compared} onClick={() => toggleCompare(nodeId)}>
      {compared && <span aria-hidden="true">✓ </span>}
      Compare
    </button>
  )
}
