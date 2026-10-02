import './GlobePane.css'

// Holds the globe pane while the lazy globe chunk, MapLibre included, downloads (#264). Same box
// and card as the error boundary's message, so the pane doesn't shift when either replaces it.
export function GlobePlaceholder() {
  return (
    <div className="globe globe-unavailable" role="status" aria-label="Map status">
      <div className="globe-unavailable-card">
        <p>Loading the globe…</p>
      </div>
    </div>
  )
}
