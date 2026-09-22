// Tabbed container for the SplitPane left slot: the request Inspector (#40) and the future
// API graph view (#-, "coming in M2"). Inspector defaults to active since the graph isn't built.

import { useState } from 'react'
import { InspectorPanel } from './inspector/InspectorPanel'
import { Pane } from './Pane'
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
        {activeTab === 'inspector' ? (
          <InspectorPanel />
        ) : (
          <Pane title="Graph" note="NOAA API ecosystem — coming in M2" />
        )}
      </div>
    </div>
  )
}
