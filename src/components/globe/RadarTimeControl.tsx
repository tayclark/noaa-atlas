import { useEffect, useState } from 'react'
import { formatFrameOffset } from './radarTimes'

const PLAY_INTERVAL_MS = 700

type Props = {
  frames: string[]
  /** The selected frame's index. The last frame is the latest one. */
  index: number
  onChange: (index: number) => void
  /** Held while the globe is out of sight (#78): a loop nobody can see would only cost battery. */
  paused?: boolean
}

// The radar's time slider (#74): scrub the available frames, step one at a time (a frame is about
// a pixel of a phone-sized track, #78) or play them in a loop. Playback never starts on its own, so
// a reduced-motion user only animates by asking for it.
export function RadarTimeControl({ frames, index, onChange, paused = false }: Props) {
  const [playing, setPlaying] = useState(false)
  const last = frames.length - 1
  const running = playing && !paused

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => onChange(index >= last ? 0 : index + 1), PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [running, index, last, onChange])

  const step = (delta: number) => {
    setPlaying(false)
    onChange(index + delta)
  }

  const frame = frames[index]
  const clock = new Date(frame).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="radar-time" role="group" aria-label="Radar time">
      <button
        type="button"
        className="radar-time-play"
        aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button
        type="button"
        className="radar-time-step"
        aria-label="Previous radar frame"
        disabled={index <= 0}
        onClick={() => step(-1)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label="Radar frame"
        aria-valuetext={`${clock}, ${formatFrameOffset(frame, frames[last])}`}
        onChange={(e) => {
          setPlaying(false)
          onChange(Number(e.target.value))
        }}
      />
      <button
        type="button"
        className="radar-time-step"
        aria-label="Next radar frame"
        disabled={index >= last}
        onClick={() => step(1)}
      >
        <span aria-hidden="true">›</span>
      </button>
      <span className="radar-time-label">
        {clock} · {formatFrameOffset(frame, frames[last])}
      </span>
    </div>
  )
}
