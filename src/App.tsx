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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <h1 className="app-title">NOAA Atlas</h1>
        <p className="app-subtitle">Which NOAA API do I use for X?</p>
      </header>
      <main className="app-main" id="main" tabIndex={-1}>
        {narrow ? <LeftPanel globe={<MapLibreGlobe />} /> : <SplitPane left={<LeftPanel />} right={<MapLibreGlobe />} />}
      </main>
      <footer className="app-footer">
        <p>
          Data from NOAA and partner services. Not an official NOAA product and not endorsed by NOAA. Not for emergency or life-safety
          decisions; use{' '}
          <a href="https://www.weather.gov" target="_blank" rel="noreferrer">
            weather.gov
          </a>
          .{' '}
          <a href="https://github.com/tayclark/noaa-atlas#data-terms-and-attribution" target="_blank" rel="noreferrer">
            Data terms
          </a>
          . Made with{' '}
          <span role="img" aria-label="love">
            ❤️
          </span>{' '}
          in Ocean Springs.
        </p>
      </footer>
    </div>
  )
}

export default App
