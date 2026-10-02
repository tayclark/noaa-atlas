// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlobeErrorBoundary } from './GlobeErrorBoundary'

function ThrowsOnMount({ name }: { name: string }) {
  useEffect(() => {
    const error = new Error('WebGL2 is required to display this map.')
    error.name = name
    throw error
  }, [name])
  return <div>map</div>
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('GlobeErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <GlobeErrorBoundary>
        <div>globe</div>
      </GlobeErrorBoundary>,
    )
    expect(screen.getByText('globe')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Map status' })).toBeNull()
  })

  it('shows the WebGL fallback for an error thrown from an effect, and leaves its siblings alone', () => {
    // React reports caught errors to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <>
        <div>graph</div>
        <GlobeErrorBoundary>
          <ThrowsOnMount name="GPUInitializationError" />
        </GlobeErrorBoundary>
      </>,
    )
    const status = screen.getByRole('status', { name: 'Map status' })
    expect(status.textContent).toMatch(/Globe unavailable/)
    expect(status.textContent).toMatch(/needs WebGL2/)
    expect(screen.queryByText('map')).toBeNull()
    expect(screen.getByText('graph')).toBeTruthy()
  })

  it('shows the generic message for other errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <GlobeErrorBoundary>
        <ThrowsOnMount name="TypeError" />
      </GlobeErrorBoundary>,
    )
    expect(screen.getByRole('status', { name: 'Map status' }).textContent).toMatch(/couldn't start/)
  })
})
