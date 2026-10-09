// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeNhcStormData } from '../../data/nhcFixtures'
import { resetTime, startPlayer } from '../../data/timeStore'
import { advisoryFrameIndex, buildStormTracks, frameTimes, type StormTrack } from './stormTrack'
import { StormTrackControl } from './StormTrackControl'

const TRACKS = buildStormTracks(makeNhcStormData())
const ISAIAS = TRACKS[0] as StormTrack
const FRAMES = frameTimes(ISAIAS)
const ADVISORY = advisoryFrameIndex(FRAMES, ISAIAS)

function renderControl(props: Partial<Parameters<typeof StormTrackControl>[0]> = {}) {
  const onChange = vi.fn()
  const onTrackChange = vi.fn()
  const view = render(
    <StormTrackControl
      tracks={TRACKS}
      track={ISAIAS}
      onTrackChange={onTrackChange}
      frames={FRAMES}
      index={ADVISORY}
      advisoryIndex={ADVISORY}
      onChange={onChange}
      {...props}
    />,
  )
  return { ...view, onChange, onTrackChange }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  resetTime()
  vi.useRealTimers()
})

describe('StormTrackControl', () => {
  it('spans the whole track and reads out the storm at the selected frame', () => {
    renderControl()
    const slider = screen.getByRole('slider', { name: 'Hurricane Isaias track time' }) as HTMLInputElement
    expect(slider.max).toBe(String(FRAMES.length - 1))
    expect(slider.value).toBe(String(ADVISORY))
    expect(screen.getByText(/Fri 9 Oct, 15:00 UTC · latest advisory · 105 kt, Cat 3/)).toBeTruthy()
  })

  it('reports the frame the slider moves to', () => {
    const { onChange } = renderControl()
    fireEvent.change(screen.getByRole('slider', { name: /track time/ }), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('does not play until asked, then advances and loops back, and pauses on a second press', () => {
    const { onChange, rerender } = renderControl({ index: 0 })
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play Hurricane Isaias track' }))
    act(() => void vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(1)

    rerender(
      <StormTrackControl tracks={TRACKS} track={ISAIAS} onTrackChange={() => {}} frames={FRAMES} index={FRAMES.length - 1} advisoryIndex={ADVISORY} onChange={onChange} />,
    )
    act(() => void vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(0)

    fireEvent.click(screen.getByRole('button', { name: 'Pause Hurricane Isaias track' }))
    onChange.mockClear()
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('holds playback while paused', () => {
    const { onChange } = renderControl({ paused: true })
    fireEvent.click(screen.getByRole('button', { name: /Play/ }))
    act(() => void vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops playing when the user scrubs', () => {
    renderControl()
    fireEvent.click(screen.getByRole('button', { name: /Play/ }))
    fireEvent.change(screen.getByRole('slider', { name: /track time/ }), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: /Play/ })).toBeTruthy()
  })

  it('steps fix to fix, disabled at either end', () => {
    const { onChange, rerender } = renderControl({ index: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Next fix' }))
    expect(FRAMES[onChange.mock.calls[0]?.[0] as number]).toBe(ISAIAS.fixes[1]?.t)
    fireEvent.click(screen.getByRole('button', { name: 'Previous fix' }))
    expect(onChange).toHaveBeenLastCalledWith(0)

    rerender(<StormTrackControl tracks={TRACKS} track={ISAIAS} onTrackChange={() => {}} frames={FRAMES} index={0} advisoryIndex={ADVISORY} onChange={onChange} />)
    expect((screen.getByRole('button', { name: 'Previous fix' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers a chip per storm, and choosing one stops playback', () => {
    const { onTrackChange } = renderControl()
    const chips = screen.getByRole('group', { name: 'Storm' })
    expect(chips.textContent).toBe('IsaiasRachel')
    expect(screen.getByRole('button', { name: 'Hurricane Isaias' }).getAttribute('aria-pressed')).toBe('true')
    act(() => startPlayer('storm'))
    fireEvent.click(screen.getByRole('button', { name: 'Tropical Storm Rachel' }))
    expect(onTrackChange).toHaveBeenCalledWith('EP3')
    expect(screen.getByRole('button', { name: /Play/ })).toBeTruthy()
  })

  it('names the satellite image under the track when there is one', () => {
    const { rerender } = renderControl({ imagery: 'satellite latest, 20:25 UTC' })
    expect(screen.getByText(/satellite latest, 20:25 UTC/)).toBeTruthy()
    rerender(<StormTrackControl tracks={TRACKS} track={ISAIAS} onTrackChange={() => {}} frames={FRAMES} index={ADVISORY} advisoryIndex={ADVISORY} onChange={() => {}} />)
    expect(screen.queryByText(/satellite/)).toBeNull()
  })

  it('leaves the chips out for a single storm', () => {
    renderControl({ tracks: [ISAIAS] })
    expect(screen.queryByRole('group', { name: 'Storm' })).toBeNull()
  })
})
