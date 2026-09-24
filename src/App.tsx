import { LeftPanel } from './components/LeftPanel'
import { SplitPane } from './components/SplitPane'
import { MapLibreGlobe } from './components/globe/MapLibreGlobe'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NOAA Atlas</h1>
        <p className="app-subtitle">Which NOAA API do I use for X?</p>
      </header>
      <main className="app-main">
        <SplitPane left={<LeftPanel />} right={<MapLibreGlobe />} />
      </main>
    </div>
  )
}

export default App
