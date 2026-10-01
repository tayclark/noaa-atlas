import { useEffect, useState } from 'react'
import { formatFrameOffset } from './radarTimes'

const PLAY_INTERVAL_MS = 700

type Props = {
  frames: string[]
  /** The selected frame's index. The last frame is the latest one. */
  index: number
  onChange: (index: number) => void
}

// The radar's time slider (#74): scrub the available frames or play them in a loop. Playback never
// starts on its own, so a reduced-motion user only animates by asking for it.
export function RadarTimeControl({ frames, index, onChange }: Props) {
  const [playing, setPlaying] = useState(false)
  const last = frames.length - 1

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => onChange(index >= last ? 0 : index + 1), PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, index, last, onChange])

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
      <span className="radar-time-label">
        {clock} · {formatFrameOffset(frame, frames[last])}
      </span>
    </div>
  )
}
