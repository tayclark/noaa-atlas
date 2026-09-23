// Tabbed container for the SplitPane left slot: the request Inspector (#40) and the API graph
// view (#28). Inspector stays the default tab.

import { useState } from 'react'
import { GraphView } from './graph/GraphView'
import { InspectorPanel } from './inspector/InspectorPanel'
import './LeftPanel.css'

type LeftTab = 'inspector' | 'graph'

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'graph', label: 'Graph' },
]

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftTab>('inspector')

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
        {activeTab === 'inspector' ? <InspectorPanel /> : <GraphView />}
      </div>
    </div>
  )
}
