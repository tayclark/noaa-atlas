// The frame list of a nowCOAST WMS layer (#74, #338): read from GetCapabilities while the layer is
// shown, and re-read as frames arrive while the globe is looked at (#78). Every read, the first and
// each poll, carries a signal that hiding the layer aborts, so a read still in flight then can't
// write stale frames after they were cleared (#354). A failed read leaves the list as it was.

import { useCallback, useEffect, useState } from 'react'
import { getNowcoastCapabilities } from '../../data/nowcoastClient'
import { pollWhileVisible } from '../../data/pollWhileVisible'

const NO_FRAMES: string[] = []

export function useWmsFrames(url: string, parse: (xml: string) => string[], shown: boolean, active: boolean, refreshMs: number): string[] {
  const [frames, setFrames] = useState<string[]>(NO_FRAMES)
  const load = useCallback(
    (signal: AbortSignal) => {
      getNowcoastCapabilities(url, { signal })
        .then((xml) => {
          if (!signal.aborted) setFrames(parse(xml))
        })
        .catch(() => {})
    },
    [url, parse],
  )
  useEffect(() => {
    if (!shown) return
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
      setFrames(NO_FRAMES)
    }
  }, [shown, load])
  useEffect(() => {
    if (!shown || !active) return
    const controller = new AbortController()
    const stop = pollWhileVisible(() => load(controller.signal), refreshMs)
    return () => {
      stop()
      controller.abort()
    }
  }, [shown, active, load, refreshMs])
  return frames
}
