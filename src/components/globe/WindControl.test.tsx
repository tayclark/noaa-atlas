// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindControl } from './WindControl'

const CYCLE = Date.parse('2026-10-01T00:00:00Z')
const H = 3_600_000

beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WindControl', () => {
  it('spans the forecast range in 3 hour steps and labels the shown time', () => {
    render(<WindControl cycle={CYCLE} time={CYCLE + 12 * H} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Wind forecast hour' }) as HTMLInputElement
    expect(slider.max).toBe('40')
    expect(slider.value).toBe('4')
    expect(screen.getAllByText(/\+12 h/).length).toBeGreaterThan(0)
  })

  it('reports the time the slider moves to, and Now returns to the live edge', () => {
    const onChange = vi.fn()
    render(<WindControl cycle={CYCLE} time={CYCLE} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Wind forecast hour' }), { target: { value: '8' } })
    expect(onChange).toHaveBeenLastCalledWith(CYCLE + 24 * H)
    fireEvent.click(screen.getByRole('button', { name: 'Now' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('follows the clock when the time is null', () => {
    vi.setSystemTime(CYCLE + 13 * H)
    render(<WindControl cycle={CYCLE} time={null} onChange={() => {}} />)
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('4')
    expect(screen.getByRole('button', { name: 'Now' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('steps one file at a time and disables the ends', () => {
    const onChange = vi.fn()
    render(<WindControl cycle={CYCLE} time={CYCLE} onChange={onChange} />)
    expect((screen.getByRole('button', { name: 'Previous wind step' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next wind step' }))
    expect(onChange).toHaveBeenCalledWith(CYCLE + 3 * H)
  })

  it('does not play until asked, loops, and stops while paused', () => {
    const onChange = vi.fn()
    const { rerender } = render(<WindControl cycle={CYCLE} time={CYCLE + 120 * H} onChange={onChange} />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play wind loop' }))
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenLastCalledWith(CYCLE)
    rerender(<WindControl cycle={CYCLE} time={CYCLE + 120 * H} onChange={onChange} paused />)
    onChange.mockClear()
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows an error message when given one', () => {
    render(<WindControl cycle={CYCLE} time={CYCLE} onChange={() => {}} error="Could not load." />)
    expect(screen.getByRole('status').textContent).toBe('Could not load.')
  })
})
