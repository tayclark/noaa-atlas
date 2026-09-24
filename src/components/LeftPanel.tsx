// Tabbed container for the SplitPane left slot: "Explore" (the "I need…" task finder from #25/#34
// stacked above the API graph view from #28 with a draggable divider between them, so picking a
// task highlights its path in the graph without switching tabs) and the request Inspector (#40).
// Explore is the default tab (the app's primary entry point per #25's framing).

import { useState } from 'react'
import { FinderPanel } from './finder/FinderPanel'
import { GraphView } from './graph/GraphView'
import { InspectorPanel } from './inspector/InspectorPanel'
import { SplitPane } from './SplitPane'
import './LeftPanel.css'

type LeftTab = 'explore' | 'inspector'

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'inspector', label: 'Inspector' },
]

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftTab>('explore')

  return (
    <div className="left-panel">
      <div className="left-panel-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`left-panel-tab ${activeTab === tab.id ? 'left-panel-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
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
        {activeTab === 'inspector' && <InspectorPanel />}
      </div>
    </div>
  )
}
