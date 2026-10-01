// Tabbed container for the SplitPane left slot. Wide: "Explore" (the "I need…" task finder from
// #25/#34 stacked above the API graph view from #28 with a draggable divider between them, so
// picking a task highlights its path in the graph without switching tabs), Compare (#76) and the
// request Inspector (#40). Compact (a phone, #78): the finder and the graph are tabs of their own,
// each at full height, the globe is passed in as a tab too, and the tab bar moves to the bottom of
// the screen. Explore is the default tab (the app's primary entry point per #25's framing).
//
// The views that hold state (finder, graph, globe) mount the first time they are shown and then
// stay mounted, hidden, so switching tabs keeps the graph's pan and zoom, the finder's picked task
// and the map with its tiles. Compare and Inspector just read stores, so they mount while shown.

import { useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { getCompareSnapshot, subscribeCompare } from '../data/compareStore'
import { getRequestLogSnapshot, subscribeRequestLog } from '../data/requestLog'
import { getSelectionSnapshot, subscribeSelection, type Selection } from '../data/selectionStore'
import { getViewSnapshot, resolveView, showView, subscribeView, tabsFor, type ViewId } from '../data/viewStore'
import { ComparePanel } from './ComparePanel'
import { FinderPanel } from './finder/FinderPanel'
import { GraphView } from './graph/GraphView'
import { InspectorPanel } from './inspector/InspectorPanel'
import { SplitPane } from './SplitPane'
import { useNarrowLayout } from './useNarrowLayout'
import './LeftPanel.css'

const LABELS: Record<ViewId, string> = {
  explore: 'Explore',
  tasks: 'Tasks',
  graph: 'Graph',
  globe: 'Globe',
  compare: 'Compare',
  inspector: 'Inspector',
}

// The views that show what is selected, so each gets a dot while a newer selection is waiting there.
const SELECTION_VIEWS: ViewId[] = ['graph', 'globe']

const ICONS: Partial<Record<ViewId, ReactNode>> = {
  tasks: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  graph: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7 6h10M6.5 7.5l4.5 9M17.5 7.5l-4.5 9" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  compare: (
    <>
      <rect x="4" y="5" width="6" height="14" rx="1" />
      <rect x="14" y="5" width="6" height="14" rx="1" />
    </>
  ),
  inspector: <path d="M4 7l5 5-5 5M12 18h8" />,
}

function TabIcon({ view }: { view: ViewId }) {
  return (
    <svg
      className="left-panel-tab-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[view]}
    </svg>
  )
}

interface LeftPanelProps {
  /** The globe, when it lives in a tab here rather than beside this panel (compact layout, #78). */
  globe?: ReactNode
}

export function LeftPanel({ globe }: LeftPanelProps) {
  const compact = useNarrowLayout()
  const requested = useSyncExternalStore(subscribeView, getViewSnapshot)
  const tabs = tabsFor(compact, Boolean(globe))
  const resolved = resolveView(requested, compact)
  const activeTab = tabs.includes(resolved) ? resolved : (tabs[0] as ViewId)

  // Shown on the Inspector tab (#150), so live calls are discoverable from the Explore tab.
  const requestCount = useSyncExternalStore(subscribeRequestLog, getRequestLogSnapshot).length
  const compareCount = useSyncExternalStore(subscribeCompare, getCompareSnapshot).length

  // The store hands out a new object per change, so "the selection last seen in a view" is a plain
  // comparison. A view that is showing has seen the current selection, whatever changed it.
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const [seen, setSeen] = useState<Partial<Record<ViewId, Selection>>>({ graph: selection, globe: selection })
  if (SELECTION_VIEWS.includes(activeTab) && seen[activeTab] !== selection) setSeen({ ...seen, [activeTab]: selection })
  const hasNews = (view: ViewId) => compact && SELECTION_VIEWS.includes(view) && activeTab !== view && seen[view] !== selection

  // Mounted the first time a view shows (see the header comment).
  const [mounted, setMounted] = useState<ViewId[]>([activeTab])
  if (!mounted.includes(activeTab)) setMounted([...mounted, activeTab])

  // Arrow keys, Home and End move between tabs, and only the active tab is in the Tab order.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (next === null) return
    event.preventDefault()
    const target = tabs[next] as ViewId
    showView(target)
    document.getElementById(`left-tab-${target}`)?.focus()
  }

  const panelBody = (view: ViewId): ReactNode => {
    if (view === 'compare') return activeTab === 'compare' && <ComparePanel />
    if (view === 'inspector') return activeTab === 'inspector' && <InspectorPanel />
    if (!mounted.includes(view)) return null
    if (view === 'globe') return globe
    if (view === 'tasks')
      return (
        <div className="left-panel-explore-finder">
          <FinderPanel />
        </div>
      )
    if (view === 'graph')
      return (
        <div className="left-panel-explore-graph">
          <GraphView />
        </div>
      )
    return (
      <SplitPane
        direction="column"
        defaultFraction={0.35}
        dividerLabel="Resize finder and graph"
        left={
          <div className="left-panel-explore-finder">
            <FinderPanel />
          </div>
        }
        right={
          <div className="left-panel-explore-graph">
            <GraphView />
          </div>
        }
      />
    )
  }

  return (
    <div className="left-panel">
      <div className="left-panel-tabs" role="tablist" aria-label="Views">
        {tabs.map((view, index) => (
          <button
            key={view}
            id={`left-tab-${view}`}
            type="button"
            role="tab"
            aria-selected={activeTab === view}
            aria-controls={`left-panel-${view}`}
            tabIndex={activeTab === view ? 0 : -1}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={`left-panel-tab ${activeTab === view ? 'left-panel-tab-active' : ''}`}
            onClick={() => showView(view)}
          >
            {compact && <TabIcon view={view} />}
            {LABELS[view]}
            {view === 'inspector' && requestCount > 0 && (
              <span className="left-panel-tab-count" aria-label={`${requestCount} ${requestCount === 1 ? 'request' : 'requests'}`}>
                {requestCount}
              </span>
            )}
            {view === 'compare' && compareCount > 0 && (
              <span className="left-panel-tab-count" aria-label={`${compareCount} selected`}>
                {compareCount}
              </span>
            )}
            {hasNews(view) && <span className="left-panel-tab-dot" role="img" aria-label="updated" />}
          </button>
        ))}
      </div>
      <div className="left-panel-panels">
        {tabs.map((view) => (
          <div
            key={view}
            id={`left-panel-${view}`}
            role="tabpanel"
            aria-labelledby={`left-tab-${view}`}
            className="left-panel-panel"
            hidden={activeTab !== view}
          >
            {panelBody(view)}
          </div>
        ))}
      </div>
    </div>
  )
}
