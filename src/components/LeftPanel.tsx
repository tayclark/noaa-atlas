// Tabbed container for the SplitPane left slot: "Explore" (the "I need…" task finder from #25/#34
// stacked above the API graph view from #28 with a draggable divider between them, so picking a
// task highlights its path in the graph without switching tabs) and the request Inspector (#40).
// Explore is the default tab (the app's primary entry point per #25's framing). On a phone the
// globe is passed in and becomes a third tab instead of the other half of the screen (#78).

import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getRequestLogSnapshot, subscribeRequestLog } from '../data/requestLog'
import { getSelectionSnapshot, subscribeSelection } from '../data/selectionStore'
import { FinderPanel } from './finder/FinderPanel'
import { GraphView } from './graph/GraphView'
import { InspectorPanel } from './inspector/InspectorPanel'
import { SplitPane } from './SplitPane'
import './LeftPanel.css'

type LeftTab = 'explore' | 'globe' | 'inspector'

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'globe', label: 'Globe' },
  { id: 'inspector', label: 'Inspector' },
]

interface LeftPanelProps {
  /** The globe, when it lives in a tab here rather than beside this panel (phone width, #78). */
  globe?: ReactNode
}

export function LeftPanel({ globe }: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>('explore')
  // Shown on the Inspector tab (#150), so live calls are discoverable from the Explore tab.
  const requestCount = useSyncExternalStore(subscribeRequestLog, getRequestLogSnapshot).length
  // The store hands out a new object per change, so "the selection last seen on the globe" is a
  // plain comparison: the Globe tab gets a dot while a newer selection is waiting there.
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const [selectionSeenOnGlobe, setSelectionSeenOnGlobe] = useState(selection)
  const globeHasNews = Boolean(globe) && activeTab !== 'globe' && selection !== selectionSeenOnGlobe
  const tabs = globe ? TABS : TABS.filter((tab) => tab.id !== 'globe')

  const openTab = (tab: LeftTab) => {
    // Entering or leaving the globe counts as having seen whatever it shows now.
    if (tab === 'globe' || activeTab === 'globe') setSelectionSeenOnGlobe(selection)
    setActiveTab(tab)
  }

  return (
    <div className="left-panel">
      <div className="left-panel-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`left-panel-tab ${activeTab === tab.id ? 'left-panel-tab-active' : ''}`}
            onClick={() => openTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'inspector' && requestCount > 0 && (
              <span className="left-panel-tab-count" aria-label={`${requestCount} ${requestCount === 1 ? 'request' : 'requests'}`}>
                {requestCount}
              </span>
            )}
            {tab.id === 'globe' && globeHasNews && <span className="left-panel-tab-dot" aria-label="updated" />}
          </button>
        ))}
      </div>
      <div className="left-panel-content">
        {activeTab === 'explore' && (
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
        )}
        {/* Kept mounted while hidden, so switching tabs doesn't reload the map, its tiles and its
            live requests; MapLibre resizes itself when the container shows again. */}
        {globe && (
          <div className="left-panel-globe" hidden={activeTab !== 'globe'}>
            {globe}
          </div>
        )}
        {activeTab === 'inspector' && <InspectorPanel />}
      </div>
    </div>
  )
}
