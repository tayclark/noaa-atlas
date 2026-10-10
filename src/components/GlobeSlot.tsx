// Where the current layout wants the globe (#352): adopts the globe's host element (see
// useGlobeHost.tsx) into the page while it is mounted.

import { useLayoutEffect, useRef } from 'react'

export function GlobeSlot({ host, onAttach }: { host: HTMLElement; onAttach: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // A layout effect, so the globe is in its new place before the browser paints the layout change.
  useLayoutEffect(() => {
    const slot = ref.current
    if (!slot) return
    slot.appendChild(host)
    onAttach()
    return () => {
      // The next layout's slot may already have adopted it.
      if (host.parentNode === slot) slot.removeChild(host)
    }
  }, [host, onAttach])
  return <div ref={ref} className="globe-slot" />
}
