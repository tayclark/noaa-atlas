// The play loop of a time slider (#74, #229, #334): while `running`, steps to the next frame every
// `intervalMs` and wraps from the last frame to the first. `onStep` gets the next index; it should be
// stable, or the timer restarts on every render.

import { useEffect } from 'react'

export function usePlayLoop(running: boolean, index: number, last: number, intervalMs: number, onStep: (next: number) => void): void {
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => onStep(index >= last ? 0 : index + 1), intervalMs)
    return () => clearInterval(timer)
  }, [running, index, last, intervalMs, onStep])
}
