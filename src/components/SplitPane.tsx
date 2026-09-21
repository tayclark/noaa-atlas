import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { MAX_FRACTION, MIN_FRACTION, clampFraction } from './splitFraction'
import './SplitPane.css'

const DEFAULT_FRACTION = 0.5
const KEY_STEP = 0.02

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
}

export function SplitPane({ left, right }: SplitPaneProps) {
  const [fraction, setFraction] = useState(DEFAULT_FRACTION)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0) return
    setFraction(clampFraction((e.clientX - rect.left) / rect.width))
  }

  const onPointerUp = () => setDragging(false)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowLeft: fraction - KEY_STEP,
      ArrowRight: fraction + KEY_STEP,
      Home: MIN_FRACTION,
      End: MAX_FRACTION,
    }
    if (!(e.key in next)) return
    e.preventDefault()
    setFraction(clampFraction(next[e.key]))
  }

  return (
    <div
      ref={containerRef}
      className={dragging ? 'split-pane split-pane--dragging' : 'split-pane'}
    >
      <div className="split-pane-side" style={{ flexBasis: `${fraction * 100}%` }}>
        {left}
      </div>
      <div
        className="split-pane-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={MIN_FRACTION * 100}
        aria-valuemax={MAX_FRACTION * 100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane-side split-pane-side--right">{right}</div>
    </div>
  )
}
