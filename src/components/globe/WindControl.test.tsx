// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTime } from '../../data/timeStore'
import { RadarTimeControl } from './RadarTimeControl'
import { WindControl } from './WindControl'

const CYCLE = Date.parse('2026-10-01T00:00:00Z')
const H = 3_600_000

beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }))
afterEach(() => {
  cleanup()
  resetTime()
  vi.useRealTimers()
})

describe('WindControl', () => {
  it('spans the forecast range in 3 hour steps and labels the shown time', () => {
    render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE + 12 * H} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Wind forecast hour' }) as HTMLInputElement
    expect(slider.max).toBe('40')
    expect(slider.value).toBe('4')
    expect(screen.getAllByText(/\+12 h/).length).toBeGreaterThan(0)
  })

  it('reports the time the slider moves to, and Now returns to the live edge', () => {
    const onChange = vi.fn()
    render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Wind forecast hour' }), { target: { value: '8' } })
    expect(onChange).toHaveBeenLastCalledWith(CYCLE + 24 * H)
    fireEvent.click(screen.getByRole('button', { name: 'Now' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('follows the clock when the time is null', () => {
    vi.setSystemTime(CYCLE + 13 * H)
    render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={null} onChange={() => {}} />)
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('4')
    expect(screen.getByRole('button', { name: 'Now' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('hands playback over when another control starts playing', () => {
    const frames = ['2026-10-01T02:40:00.000Z', '2026-10-01T02:50:00.000Z']
    render(
      <>
        <RadarTimeControl frames={frames} index={0} onChange={() => {}} />
        <WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE} onChange={() => {}} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play wind loop' }))
    expect(screen.getByRole('button', { name: 'Pause wind loop' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play radar loop' }))
    expect(screen.getByRole('button', { name: 'Pause radar loop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play wind loop' })).toBeTruthy()
  })

  it('steps one file at a time and disables the ends', () => {
    const onChange = vi.fn()
    render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE} onChange={onChange} />)
    expect((screen.getByRole('button', { name: 'Previous wind step' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next wind step' }))
    expect(onChange).toHaveBeenCalledWith(CYCLE + 3 * H)
  })

  it('does not play until asked, loops, and stops while paused', () => {
    const onChange = vi.fn()
    const { rerender } = render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE + 120 * H} onChange={onChange} />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play wind loop' }))
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenLastCalledWith(CYCLE)
    rerender(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE + 120 * H} onChange={onChange} paused />)
    onChange.mockClear()
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows an error message when given one', () => {
    render(<WindControl layer="wind" onLayerChange={() => {}} cycle={CYCLE} time={CYCLE} onChange={() => {}} error="Could not load." />)
    expect(screen.getByRole('status').textContent).toBe('Could not load.')
  })

  it('switches layer from the toggle and relabels the control and legend for waves', () => {
    const onLayerChange = vi.fn()
    const { rerender } = render(<WindControl layer="wind" onLayerChange={onLayerChange} cycle={CYCLE} time={CYCLE} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Wind' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Waves' }))
    expect(onLayerChange).toHaveBeenCalledWith('waves')
    rerender(<WindControl layer="waves" onLayerChange={onLayerChange} cycle={CYCLE} time={CYCLE} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Wave forecast hour' })).toBeTruthy()
    expect(screen.getByLabelText('Wave height legend')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play wave loop' })).toBeTruthy()
  })
})
