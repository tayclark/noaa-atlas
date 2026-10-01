import { useEffect, useMemo, useState } from 'react'
import { WIND_LEGEND_STOPS_MS, windColor } from './windField'
import { formatWindTime, windIndexForTime, windTimes } from './windTime'

const PLAY_INTERVAL_MS = 700
const LEGEND_MAX_MS = WIND_LEGEND_STOPS_MS[WIND_LEGEND_STOPS_MS.length - 1]
const LEGEND_TICKS = [0, 10, 20, 30]

type Props = {
  /** The model run the slider covers (epoch ms). */
  cycle: number
  /** The shared time, or null for now. */
  time: number | null
  onChange: (time: number | null) => void
  /** Held while the globe is out of sight (#78). */
  paused?: boolean
  error?: string | null
}

const legendGradient = `linear-gradient(to right, ${WIND_LEGEND_STOPS_MS.map((s) => {
  const [r, g, b] = windColor(s)
  return `rgb(${r} ${g} ${b}) ${(s / LEGEND_MAX_MS) * 100}%`
}).join(', ')})`

// The wind overlay's time slider and legend (#229). It scrubs the shared time over the GFS cycle's
// 5-day range in 3-hour steps, like the radar control. Playback never starts on its own.
export function WindControl({ cycle, time, onChange, paused = false, error = null }: Props) {
  const [playing, setPlaying] = useState(false)
  // "Now" is read once, when the control appears: the slider steps are 3 hours apart.
  const [mountedAt] = useState(Date.now)
  const times = useMemo(() => windTimes(cycle), [cycle])
  const last = times.length - 1
  const index = windIndexForTime(cycle, time ?? mountedAt)
  const running = playing && !paused

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => onChange(times[index >= last ? 0 : index + 1]), PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [running, index, last, onChange, times])

  const step = (delta: number) => {
    setPlaying(false)
    onChange(times[Math.min(last, Math.max(0, index + delta))])
  }
  const shown = time ?? times[index]

  return (
    <div className="radar-time wind-control" role="group" aria-label="Wind forecast time">
      <button
        type="button"
        className="radar-time-play"
        aria-label={playing ? 'Pause wind loop' : 'Play wind loop'}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="radar-time-step" aria-label="Previous wind step" disabled={index <= 0} onClick={() => step(-1)}>
        <span aria-hidden="true">‹</span>
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label="Wind forecast hour"
        aria-valuetext={formatWindTime(cycle, times[index])}
        onChange={(e) => {
          setPlaying(false)
          onChange(times[Number(e.target.value)])
        }}
      />
      <button type="button" className="radar-time-step" aria-label="Next wind step" disabled={index >= last} onClick={() => step(1)}>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className="radar-time-step wind-now"
        aria-pressed={time === null}
        onClick={() => {
          setPlaying(false)
          onChange(null)
        }}
      >
        Now
      </button>
      <span className="radar-time-label">{formatWindTime(cycle, shown)}</span>
      <div className="wind-legend" aria-label="Wind speed legend">
        <span className="wind-legend-bar" style={{ backgroundImage: legendGradient }} aria-hidden="true" />
        <span className="wind-legend-ticks" aria-hidden="true">
          {LEGEND_TICKS.map((v) => (
            <span key={v}>{v}</span>
          ))}
          <span>m/s</span>
        </span>
        <span className="wind-legend-source">
          10 m wind · <a href="https://registry.opendata.aws/noaa-gfs-bdp-pds/">NOAA/NCEP GFS via AWS Open Data</a>
        </span>
      </div>
      {error && (
        <span className="wind-error" role="status">
          {error}
        </span>
      )}
    </div>
  )
}
