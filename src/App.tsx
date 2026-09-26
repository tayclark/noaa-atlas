import { LeftPanel } from './components/LeftPanel'
import { SplitPane } from './components/SplitPane'
import { MapLibreGlobe } from './components/globe/MapLibreGlobe'
import { useNarrowLayout } from './components/useNarrowLayout'
import './App.css'

function App() {
  // On a phone the globe is a tab of its own rather than a sliver of a side-by-side split (#78).
  const narrow = useNarrowLayout()
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NOAA Atlas</h1>
        <p className="app-subtitle">Which NOAA API do I use for X?</p>
      </header>
      <main className="app-main">
        {narrow ? <LeftPanel globe={<MapLibreGlobe />} /> : <SplitPane left={<LeftPanel />} right={<MapLibreGlobe />} />}
      </main>
    </div>
  )
}

export default App
