// One globe for both layouts (#352). The wide layout puts the globe beside the left panel and the
// compact one in a tab of its own, so rendering it in place would remount MapLibre (a new WebGL
// context, refetched tiles, a reset camera) every time the window crossed 700px. Instead the globe
// is portalled into a detached host element whose React parent never changes, and whichever slot
// the current layout renders adopts that element into the page.
//
// The globe renders only once a slot first asks for it, so a phone, which shows the globe's slot
// only when its tab is opened, still doesn't fetch MapLibre until then (#264).

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** `slot` goes where the layout wants the globe; `portal` must be rendered somewhere that stays mounted. */
export function useGlobeHost(globe: ReactNode): { slot: ReactNode; portal: ReactNode } {
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.className = 'globe-host'
    return el
  })
  const [wanted, setWanted] = useState(false)
  const onAttach = useCallback(() => setWanted(true), [])
  return {
    slot: <GlobeSlot host={host} onAttach={onAttach} />,
    portal: wanted ? createPortal(globe, host) : null,
  }
}

function GlobeSlot({ host, onAttach }: { host: HTMLElement; onAttach: () => void }) {
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
