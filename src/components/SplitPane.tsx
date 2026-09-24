import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { MAX_FRACTION, MIN_FRACTION, clampFraction } from './splitFraction'
import './SplitPane.css'

const DEFAULT_FRACTION = 0.5
const KEY_STEP = 0.02

interface SplitPaneProps {
  /** First pane: the left pane in a row split, the top pane in a column split. */
  left: ReactNode
  /** Second pane: the right pane in a row split, the bottom pane in a column split. */
  right: ReactNode
  direction?: 'row' | 'column'
  defaultFraction?: number
  dividerLabel?: string
}

export function SplitPane({
  left,
  right,
  direction = 'row',
  defaultFraction = DEFAULT_FRACTION,
  dividerLabel = 'Resize panes',
}: SplitPaneProps) {
  const isColumn = direction === 'column'
  const [fraction, setFraction] = useState(clampFraction(defaultFraction))
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const size = isColumn ? rect.height : rect.width
    if (size === 0) return
    const offset = isColumn ? e.clientY - rect.top : e.clientX - rect.left
    setFraction(clampFraction(offset / size))
  }

  const onPointerUp = () => setDragging(false)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const [decrease, increase] = isColumn ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    const next: Record<string, number> = {
      [decrease]: fraction - KEY_STEP,
      [increase]: fraction + KEY_STEP,
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
      className={`split-pane${isColumn ? ' split-pane--column' : ''}${dragging ? ' split-pane--dragging' : ''}`}
    >
      <div className="split-pane-side" style={{ flexBasis: `${fraction * 100}%` }}>
        {left}
      </div>
      <div
        className="split-pane-divider"
        role="separator"
        aria-orientation={isColumn ? 'horizontal' : 'vertical'}
        aria-label={dividerLabel}
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
