// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RadarTimeControl } from './RadarTimeControl'

const FRAMES = ['2026-10-01T02:40:00.000Z', '2026-10-01T02:50:00.000Z', '2026-10-01T03:00:00.000Z']

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('RadarTimeControl', () => {
  it('spans every frame and labels the selected one against the latest', () => {
    render(<RadarTimeControl frames={FRAMES} index={1} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Radar frame' }) as HTMLInputElement
    expect(slider.max).toBe('2')
    expect(slider.value).toBe('1')
    expect(screen.getByText(/10 min earlier/)).toBeTruthy()
  })

  it('reports the frame the slider moves to', () => {
    const onChange = vi.fn()
    render(<RadarTimeControl frames={FRAMES} index={2} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Radar frame' }), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('does not play until asked, then steps and loops back, and pauses on a second press', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RadarTimeControl frames={FRAMES} index={1} onChange={onChange} />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play radar loop' }))
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenLastCalledWith(2)

    rerender(<RadarTimeControl frames={FRAMES} index={2} onChange={onChange} />)
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenLastCalledWith(0)

    fireEvent.click(screen.getByRole('button', { name: 'Pause radar loop' }))
    onChange.mockClear()
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops playing when the user scrubs', () => {
    const onChange = vi.fn()
    render(<RadarTimeControl frames={FRAMES} index={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play radar loop' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Radar frame' }), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: 'Play radar loop' })).toBeTruthy()
  })

  it('steps one frame at a time, stopping at either end', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RadarTimeControl frames={FRAMES} index={1} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous radar frame' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next radar frame' }))
    expect(onChange).toHaveBeenLastCalledWith(2)

    rerender(<RadarTimeControl frames={FRAMES} index={0} onChange={onChange} />)
    expect((screen.getByRole('button', { name: 'Previous radar frame' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<RadarTimeControl frames={FRAMES} index={2} onChange={onChange} />)
    expect((screen.getByRole('button', { name: 'Next radar frame' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stops playing when the user steps', () => {
    render(<RadarTimeControl frames={FRAMES} index={0} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play radar loop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next radar frame' }))
    expect(screen.getByRole('button', { name: 'Play radar loop' })).toBeTruthy()
  })

  it('holds the loop while paused, and picks it up again when it is not', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RadarTimeControl frames={FRAMES} index={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play radar loop' }))
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenCalledTimes(1)

    rerender(<RadarTimeControl frames={FRAMES} index={1} onChange={onChange} paused />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).toHaveBeenCalledTimes(1)
    // Still the reader's loop, so it is still shown as playing.
    expect(screen.getByRole('button', { name: 'Pause radar loop' })).toBeTruthy()

    rerender(<RadarTimeControl frames={FRAMES} index={1} onChange={onChange} />)
    act(() => void vi.advanceTimersByTime(700))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
