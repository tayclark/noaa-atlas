import { useEffect } from 'react'
import { usePlayer } from './usePlayer'
import { describeStormState, formatAdvisoryOffset, formatStormTime, shortStormName, stateAt, stepToFix, type StormTrack } from './stormTrack'

/** A whole loop takes about this long, however many hourly frames the storm has. */
const LOOP_MS = 12_000
const MIN_FRAME_MS = 40
const MAX_FRAME_MS = 150

type Props = {
  tracks: readonly StormTrack[]
  /** The storm the slider drives. */
  track: StormTrack
  onTrackChange: (bin: string) => void
  /** Hourly frame times for `track`, from its first fix to its last forecast point. */
  frames: readonly number[]
  index: number
  /** The frame at the latest advisory, marked on the slider as "now". */
  advisoryIndex: number
  onChange: (index: number) => void
  /** Which satellite image is under the track, e.g. "satellite 14:05 UTC", or null when there is none. */
  imagery?: string | null
  /** Held while the globe is out of sight (#78). */
  paused?: boolean
}

// The storm track's play control (#334): scrub a storm from its first fix through its forecast, step
// fix to fix, or play the whole track. As with the radar, playback never starts on its own, so a
// reduced-motion user only animates by asking for it. Chips pick the storm when there are several.
export function StormTrackControl({ tracks, track, onTrackChange, frames, index, advisoryIndex, onChange, imagery = null, paused = false }: Props) {
  const [playing, setPlaying] = usePlayer('storm')
  const last = frames.length - 1
  const running = playing && !paused
  const frameMs = Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, LOOP_MS / Math.max(1, frames.length)))

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => onChange(index >= last ? 0 : index + 1), frameMs)
    return () => clearInterval(timer)
  }, [running, index, last, onChange, frameMs])

  const step = (direction: -1 | 1) => {
    setPlaying(false)
    onChange(stepToFix(frames, track, index, direction))
  }

  const t = frames[index] ?? track.advisoryTime
  const state = stateAt(track, t)
  const time = formatStormTime(t)
  const offset = formatAdvisoryOffset(t, track.advisoryTime)
  const reading = describeStormState(state)

  return (
    <div className="radar-time storm-track-control" role="group" aria-label="Storm track time">
      {tracks.length > 1 && (
        <div className="storm-track-chips" role="group" aria-label="Storm">
          {tracks.map((option) => (
            <button
              key={option.bin}
              type="button"
              className="radar-time-step storm-track-chip"
              aria-pressed={option.bin === track.bin}
              aria-label={option.name}
              onClick={() => {
                setPlaying(false)
                onTrackChange(option.bin)
              }}
            >
              {shortStormName(option.name)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="radar-time-play"
        aria-label={playing ? `Pause ${track.name} track` : `Play ${track.name} track`}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="radar-time-step" aria-label="Previous fix" disabled={index <= 0} onClick={() => step(-1)}>
        <span aria-hidden="true">‹</span>
      </button>
      <span className="storm-track-slider">
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label={`${track.name} track time`}
          aria-valuetext={`${time}, ${offset}, ${reading}`}
          onChange={(e) => {
            setPlaying(false)
            onChange(Number(e.target.value))
          }}
        />
        {last > 0 && (
          <span className="storm-track-now" style={{ left: `calc(8px + (100% - 16px) * ${advisoryIndex / last})` }} aria-hidden="true" />
        )}
      </span>
      <button type="button" className="radar-time-step" aria-label="Next fix" disabled={index >= last} onClick={() => step(1)}>
        <span aria-hidden="true">›</span>
      </button>
      <span className="radar-time-label">
        {time} · {offset} · {reading}
        {imagery && <span className="storm-track-imagery"> · {imagery}</span>}
      </span>
    </div>
  )
}
