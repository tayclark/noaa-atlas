import { Pane } from './components/Pane'
import { SplitPane } from './components/SplitPane'
import { MapLibreGlobe } from './components/globe/MapLibreGlobe'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NOAA Atlas</h1>
      </header>
      <main className="app-main">
        <SplitPane
          left={<Pane title="Graph" note="NOAA API ecosystem — coming in M2" />}
          right={<MapLibreGlobe />}
        />
      </main>
    </div>
  )
}

export default App
