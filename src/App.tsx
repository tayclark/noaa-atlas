import { Pane } from './components/Pane'
import { SplitPane } from './components/SplitPane'
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
          right={<Pane title="Globe" note="NOAA APIs in action — coming in M4" />}
        />
      </main>
    </div>
  )
}

export default App
