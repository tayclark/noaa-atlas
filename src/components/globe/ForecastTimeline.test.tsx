// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForecastTimelineData } from './forecastTimelineData'
import { ForecastTimeline } from './ForecastTimeline'
import { getTimeSnapshot, resetTime } from '../../data/timeStore'

vi.mock('./forecastTimelineData', () => ({ loadForecastTimeline: vi.fn() }))
import { loadForecastTimeline } from './forecastTimelineData'

const HOUR = 3_600_000
const START = Date.parse('2026-10-01T00:00:00Z')
const NOW = START + 2 * HOUR + 600_000

function data(overrides: Partial<ForecastTimelineData> = {}): ForecastTimelineData {
  return {
    series: [0, 1, 2, 3].map((i) => ({
      time: START + i * HOUR,
      windMph: 10 + i,
      gustMph: 15 + i,
      windFromDeg: 225,
      waveFt: i < 2 ? 1 : null,
    })),
    tides: [0, 1, 2, 3].map((i) => ({ time: START + i * HOUR, metres: 0.2 * i })),
    station: { id: '123', name: 'Test Harbor' },
    tideMessage: null,
    ...overrides,
  }
}

async function mount(result: Promise<ForecastTimelineData>, props: { paused?: boolean } = {}) {
  vi.mocked(loadForecastTimeline).mockReturnValue(result)
  render(<ForecastTimeline point={[-95.7, 39.1]} {...props} />)
  await act(async () => {
    await result.catch(() => {})
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  resetTime()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ForecastTimeline', () => {
  it('says it is loading, then draws wind, waves and tide', async () => {
    let resolve: (d: ForecastTimelineData) => void = () => {}
    vi.mocked(loadForecastTimeline).mockReturnValue(new Promise((r) => (resolve = r)))
    const { container } = render(<ForecastTimeline point={[-95.7, 39.1]} />)
    expect(screen.getByText(/Loading the forecast/)).toBeTruthy()
    await act(async () => resolve(data()))
    expect(container.querySelector('.forecast-timeline-wind')).toBeTruthy()
    expect(container.querySelector('.forecast-timeline-waves')).toBeTruthy()
    expect(container.querySelector('.forecast-timeline-tide')).toBeTruthy()
    expect(screen.getByText(/Tide: Test Harbor/)).toBeTruthy()
  })

  it('puts the cursor on the current hour and reads out wind, gusts, waves and tide there', async () => {
    await mount(Promise.resolve(data()))
    const slider = screen.getByRole('slider', { name: 'Forecast hour' }) as HTMLInputElement
    expect(slider.value).toBe('2')
    expect(slider.max).toBe('3')
    expect(document.querySelector('.forecast-timeline-readout')?.textContent).toMatch(/wind 12 mph SW, gusts 17.*tide 0\.4 m/)
  })

  it('publishes its span to the shared time and withdraws it when unmounted', async () => {
    await mount(Promise.resolve(data()))
    expect(getTimeSnapshot().range).toEqual({ start: START, end: START + 4 * HOUR })
    cleanup()
    expect(getTimeSnapshot().range).toBeNull()
  })

  it('scrubbing sets the shared time, steps by the hour, and Now goes back to live', async () => {
    await mount(Promise.resolve(data()))
    fireEvent.change(screen.getByRole('slider', { name: 'Forecast hour' }), { target: { value: '0' } })
    expect(getTimeSnapshot().time).toBe(START)
    expect((screen.getByRole('button', { name: 'Previous forecast hour' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next forecast hour' }))
    expect(getTimeSnapshot().time).toBe(START + HOUR)
    fireEvent.click(screen.getByRole('button', { name: 'Now' }))
    expect(getTimeSnapshot().time).toBeNull()
    expect((screen.getByRole('button', { name: 'Now' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('follows a time set elsewhere, such as the radar slider', async () => {
    await mount(Promise.resolve(data()))
    await act(async () => {
      const { setTime } = await import('../../data/timeStore')
      setTime(START + HOUR)
    })
    expect((screen.getByRole('slider', { name: 'Forecast hour' }) as HTMLInputElement).value).toBe('1')
  })

  it('does not play until asked, then advances an hour at a time, loops, and pauses', async () => {
    await mount(Promise.resolve(data()))
    act(() => vi.advanceTimersByTime(2000))
    expect(getTimeSnapshot().time).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Play forecast loop' }))
    act(() => vi.advanceTimersByTime(500))
    expect(getTimeSnapshot().time).toBe(START + 3 * HOUR)
    act(() => vi.advanceTimersByTime(500))
    expect(getTimeSnapshot().time).toBe(START)

    fireEvent.click(screen.getByRole('button', { name: 'Pause forecast loop' }))
    act(() => vi.advanceTimersByTime(2000))
    expect(getTimeSnapshot().time).toBe(START)
  })

  it('holds playback while the globe is hidden', async () => {
    await mount(Promise.resolve(data()), { paused: true })
    fireEvent.click(screen.getByRole('button', { name: 'Play forecast loop' }))
    act(() => vi.advanceTimersByTime(2000))
    expect(getTimeSnapshot().time).toBeNull()
  })

  it('drops the wave row and says so when the point has no wave forecast', async () => {
    const d = data()
    d.series.forEach((s) => (s.waveFt = null))
    await mount(Promise.resolve(d))
    expect(document.querySelector('.forecast-timeline-waves')).toBeNull()
    expect(screen.getByText('No wave forecast for this point.')).toBeTruthy()
  })

  it("shows the station's message when the tide curve is missing", async () => {
    await mount(Promise.resolve(data({ tides: [], tideMessage: 'No Predictions data was found.' })))
    expect(document.querySelector('.forecast-timeline-tide')).toBeNull()
    expect(screen.getByText(/Tide \(Test Harbor\): No Predictions data was found\./)).toBeTruthy()
  })

  it('reports a failed load and retries on request', async () => {
    vi.mocked(loadForecastTimeline).mockRejectedValueOnce(new Error('NWS service error (503).'))
    render(<ForecastTimeline point={[-95.7, 39.1]} />)
    await act(async () => {})
    expect(screen.getByText('NWS service error (503).')).toBeTruthy()

    vi.mocked(loadForecastTimeline).mockResolvedValue(data())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText(/Loading the forecast/)).toBeTruthy()
    await act(async () => {})
    expect(document.querySelector('.forecast-timeline-wind')).toBeTruthy()
    expect(loadForecastTimeline).toHaveBeenCalledTimes(2)
  })
})
