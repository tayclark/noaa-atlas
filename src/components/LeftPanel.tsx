// Tabbed container for the SplitPane left slot: the "I need…" task finder (#25), the request
// Inspector (#40), and the API graph view (#28). Finder is the default tab (the app's primary
// entry point per #25's framing).

import { useState } from 'react'
import { FinderPanel } from './finder/FinderPanel'
import { GraphView } from './graph/GraphView'
import { InspectorPanel } from './inspector/InspectorPanel'
import './LeftPanel.css'

type LeftTab = 'finder' | 'inspector' | 'graph'

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'finder', label: 'Finder' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'graph', label: 'Graph' },
]

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftTab>('finder')

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
        {activeTab === 'finder' && <FinderPanel />}
        {activeTab === 'inspector' && <InspectorPanel />}
        {activeTab === 'graph' && <GraphView />}
      </div>
    </div>
  )
}
