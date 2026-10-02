import { Component, type ReactNode } from 'react'
import { describeMapInitError } from './globeFailure'

// MapLibre throws from the globe's mount effect when WebGL2 is unavailable (#260). Without a
// boundary React unmounts the whole app, finder and graph included, though neither needs WebGL.
// This keeps the failure to the globe pane. React has no hook for this, hence the class.
export class GlobeErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div className="globe globe-unavailable" role="status" aria-label="Map status">
        <div className="globe-unavailable-card">
          <strong>Globe unavailable</strong>
          <p>{describeMapInitError(this.state.error)}</p>
        </div>
      </div>
    )
  }
}
