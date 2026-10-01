// The phone's node detail (#78): a bottom sheet over the Tasks and Graph views, in place of the
// floating card of a wide screen. It peeks (a header with the name, the actions and a close button)
// so a selection doesn't cover the view, and opens to nearly the full height to read the rest. Drag
// the header, or tap the grabber, to change height; pull it down from peek, or tap ✕ or press
// Escape, to dismiss it (which clears the selection). A phone held on its side has no height to
// spare, so there the sheet is a panel down the right-hand side, always open, with just its close
// button. The graph frames a selection into what the sheet leaves free, through sheetStore.

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { getCompareSnapshot, subscribeCompare, toggleCompare } from '../data/compareStore'
import { clearSelection, getSelectionSnapshot, subscribeSelection } from '../data/selectionStore'
import { setSheetBox } from '../data/sheetStore'
import { showView, type ViewId } from '../data/viewStore'
import { findGraphNode } from './graph/graphNodes'
import { NodeDetailContent } from './graph/NodeDetailPanel'
import { liveStatusLabel } from './graph/nodeDetailFormat'
import { restingSnap, sheetHeights } from './sheetSnap'
import './DetailSheet.css'

/** How far (px) a finger must travel before a touch on the header is a drag rather than a tap. */
const DRAG_SLOP = 6
/** Only the last stretch of a drag says how fast it ended. */
const VELOCITY_WINDOW_MS = 100

interface DragState {
  startY: number
  startHeight: number
  from: 'peek' | 'open'
  samples: { t: number; y: number }[]
  active: boolean
}

interface DetailSheetProps {
  /** The view it covers. It starts folded, and folds again when this changes. */
  view: ViewId
  /** Open rather than peeking when it first appears: a step picked in the finder asked for the detail. */
  startOpen: boolean
  /** Down the right-hand side, always open, instead of along the bottom. */
  side?: boolean
}

export function DetailSheet({ view, startOpen, side = false }: DetailSheetProps) {
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const node = findGraphNode(selection.selectedNodeId)
  const compared = useSyncExternalStore(subscribeCompare, getCompareSnapshot).includes(node?.id ?? '')
  const [peekOrOpen, setOpen] = useState(startOpen)
  const open = side || peekOrOpen
  const [shownFor, setShownFor] = useState(view)
  if (shownFor !== view) {
    setShownFor(view)
    setOpen(false)
  }
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [area, setArea] = useState(0)
  const [header, setHeader] = useState(0)
  const [width, setWidth] = useState(0)
  const rootRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const swallowClick = useRef(false)

  // The area is whatever the sheet sits in; the header's height is the peek height.
  const present = Boolean(node)
  useLayoutEffect(() => {
    const areaEl = rootRef.current?.parentElement
    const headerEl = headerRef.current
    if (!areaEl || !headerEl) return
    const rootEl = rootRef.current
    const measure = () => {
      setArea(areaEl.clientHeight)
      setHeader(headerEl.offsetHeight)
      setWidth(rootEl?.offsetWidth ?? 0)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(areaEl)
    observer.observe(headerEl)
    if (rootEl) observer.observe(rootEl)
    return () => observer.disconnect()
  }, [present])

  const heights = sheetHeights(area, header)
  const resting = open ? heights[1] : heights[0]
  const height = dragHeight ?? resting

  useLayoutEffect(() => {
    setSheetBox(side ? { edge: 'right', size: width } : { edge: 'bottom', size: resting })
  }, [side, width, resting])
  useLayoutEffect(() => () => setSheetBox(null), [])

  if (!node) return null

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // The actions are buttons to press, not a handle to drag by.
    if ((event.target as Element).closest('.detail-sheet-action')) return
    drag.current = {
      startY: event.clientY,
      startHeight: resting,
      from: open ? 'open' : 'peek',
      samples: [{ t: event.timeStamp, y: event.clientY }],
      active: false,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    if (!state.active) {
      if (Math.abs(state.startY - event.clientY) < DRAG_SLOP) return
      state.active = true
      // Captured only once it is a drag: capturing at pointerdown would send a plain tap's click
      // to this header instead of the grabber button.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    state.samples = [...state.samples.filter((sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS), { t: event.timeStamp, y: event.clientY }]
    setDragHeight(Math.min(heights[1], Math.max(0, state.startHeight + state.startY - event.clientY)))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current
    drag.current = null
    if (!state?.active) return
    // A drag that ends over the grabber still produces a click, which must not toggle the sheet.
    swallowClick.current = true
    window.setTimeout(() => {
      swallowClick.current = false
    }, 50)
    setDragHeight(null)
    if (cancelled) return
    const first = state.samples[0] as { t: number; y: number }
    const last = state.samples[state.samples.length - 1] as { t: number; y: number }
    const velocity = last.t > first.t ? (first.y - last.y) / (last.t - first.t) : 0
    const finalHeight = Math.min(heights[1], Math.max(0, state.startHeight + state.startY - event.clientY))
    const rest = restingSnap(finalHeight, velocity, heights, state.from)
    if (rest === 'close') clearSelection()
    else setOpen(rest === 'open')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') clearSelection()
  }

  const service = node.kind === 'service'
  return (
    <section
      ref={rootRef}
      className={`detail-sheet${side ? ' detail-sheet-side' : ''}${dragHeight === null ? '' : ' detail-sheet-dragging'}`}
      aria-label="Node detail"
      // Until it has been measured it just takes the room it needs.
      style={!side && area > 0 ? { height } : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        ref={headerRef}
        className="detail-sheet-header"
        {...(side
          ? {}
          : {
              onPointerDown,
              onPointerMove,
              onPointerUp: (event: PointerEvent<HTMLDivElement>) => endDrag(event, false),
              onPointerCancel: (event: PointerEvent<HTMLDivElement>) => endDrag(event, true),
            })}
      >
        {!side && (
          <button
            type="button"
            className="detail-sheet-grabber"
            aria-expanded={open}
            aria-label={open ? 'Collapse details' : 'Expand details'}
            onClick={() => {
              if (!swallowClick.current) setOpen((current) => !current)
            }}
          >
            <span className="detail-sheet-pill" aria-hidden="true" />
          </button>
        )}
        <div className="detail-sheet-title">
          <div className="detail-sheet-heading">
            <h3>{node.name}</h3>
            {service && (
              <span className={`node-detail-live-tag ${node.liveLayer ? 'node-detail-live' : 'node-detail-not-live'}`}>{liveStatusLabel(node)}</span>
            )}
          </div>
          <button type="button" className="detail-sheet-action detail-sheet-close" aria-label="Close details" onClick={clearSelection}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="detail-sheet-actions">
          {service && (
            <button type="button" className="detail-sheet-action" aria-pressed={compared} onClick={() => toggleCompare(node.id)}>
              {compared ? '✓ ' : ''}Compare
            </button>
          )}
          <button type="button" className="detail-sheet-action" onClick={() => showView('globe')}>
            Show on globe
          </button>
        </div>
      </div>
      {/* Folded, the body is clipped away, so it must not stay reachable by keyboard or screen reader. */}
      <div className="detail-sheet-body" inert={!open}>
        <NodeDetailContent node={node} inSheet />
      </div>
    </section>
  )
}
