import { useState } from 'react'
import { AboutDialog, Disclaimer } from './components/AboutDialog'
import { LeftPanel } from './components/LeftPanel'
import { SplitPane } from './components/SplitPane'
import { MapLibreGlobe } from './components/globe/MapLibreGlobe'
import { useNarrowLayout } from './components/useNarrowLayout'
import './App.css'

function App() {
  // On a phone the globe is a tab of its own rather than a sliver of a side-by-side split (#78).
  // `data-layout` is what the stylesheets key off, so CSS and JS agree on which layout applies.
  const compact = useNarrowLayout()
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <div className="app" data-layout={compact ? 'compact' : 'wide'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <h1 className="app-title">NOAA Atlas</h1>
        <p className="app-subtitle">Which NOAA API do I use for X?</p>
        {compact && (
          <button type="button" className="app-about-button" aria-label="About this data" onClick={() => setAboutOpen(true)}>
            ⓘ
          </button>
        )}
      </header>
      <main className="app-main" id="main" tabIndex={-1}>
        {compact ? <LeftPanel globe={<MapLibreGlobe />} /> : <SplitPane left={<LeftPanel />} right={<MapLibreGlobe />} />}
      </main>
      <footer className="app-footer">
        {compact ? (
          // One line on a phone, where the full text would take 76px of a 844px screen; the rest
          // is in the About dialog.
          <p className="app-footer-compact">
            Unofficial · Not for emergencies ·{' '}
            <a href="https://www.weather.gov" target="_blank" rel="noreferrer">
              weather.gov
            </a>{' '}
            ·{' '}
            <button type="button" onClick={() => setAboutOpen(true)}>
              About
            </button>
          </p>
        ) : (
          <Disclaimer />
        )}
      </footer>
      {compact && <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />}
    </div>
  )
}

export default App
