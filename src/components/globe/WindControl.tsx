import { useEffect, useMemo, useState } from 'react'
import { WAVE_LEGEND_STOPS_M, waveColor } from './waveField'
import { WIND_LEGEND_STOPS_MS, windColor } from './windField'
import { formatWindTime, windIndexForTime, windTimes } from './windTime'

const PLAY_INTERVAL_MS = 700

export type ForecastLayer = 'wind' | 'waves'

/** What differs between the two layers the control can scrub: names, legend and source line. */
const LAYERS: Record<
  ForecastLayer,
  { noun: string; stops: readonly number[]; ticks: number[]; unit: string; color: (v: number) => [number, number, number]; legend: string; source: string }
> = {
  wind: {
    noun: 'wind',
    stops: WIND_LEGEND_STOPS_MS,
    ticks: [0, 10, 20, 30],
    unit: 'm/s',
    color: windColor,
    legend: 'Wind speed legend',
    source: '10 m wind',
  },
  waves: {
    noun: 'wave',
    stops: WAVE_LEGEND_STOPS_M,
    ticks: [0, 4, 8, 12],
    unit: 'm',
    color: waveColor,
    legend: 'Wave height legend',
    source: 'Significant wave height',
  },
}

type Props = {
  layer: ForecastLayer
  onLayerChange: (layer: ForecastLayer) => void
  /** The model run the slider covers (epoch ms). */
  cycle: number
  /** The shared time, or null for now. */
  time: number | null
  onChange: (time: number | null) => void
  /** Held while the globe is out of sight (#78). */
  paused?: boolean
  error?: string | null
}

function legendGradient(layer: ForecastLayer): string {
  const { stops, color } = LAYERS[layer]
  const max = stops[stops.length - 1]
  return `linear-gradient(to right, ${stops
    .map((s) => {
      const [r, g, b] = color(s)
      return `rgb(${r} ${g} ${b}) ${(s / max) * 100}%`
    })
    .join(', ')})`
}

// The wind and wave overlays' time slider and legend (#229). It scrubs the shared time over the GFS
// cycle's 5-day range in 3-hour steps, like the radar control. Playback never starts on its own.
export function WindControl({ layer, onLayerChange, cycle, time, onChange, paused = false, error = null }: Props) {
  const { noun, ticks, unit, legend, source } = LAYERS[layer]
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
    <div className="radar-time wind-control" role="group" aria-label={`${noun === 'wind' ? 'Wind' : 'Wave'} forecast time`}>
      <div className="wind-layer-toggle" role="group" aria-label="Forecast layer">
        {(Object.keys(LAYERS) as ForecastLayer[]).map((key) => (
          <button
            key={key}
            type="button"
            className="radar-time-step wind-layer-button"
            aria-pressed={layer === key}
            onClick={() => {
              setPlaying(false)
              onLayerChange(key)
            }}
          >
            {key === 'wind' ? 'Wind' : 'Waves'}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="radar-time-play"
        aria-label={playing ? `Pause ${noun} loop` : `Play ${noun} loop`}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="radar-time-step" aria-label={`Previous ${noun} step`} disabled={index <= 0} onClick={() => step(-1)}>
        <span aria-hidden="true">‹</span>
      </button>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label={`${noun === 'wind' ? 'Wind' : 'Wave'} forecast hour`}
        aria-valuetext={formatWindTime(cycle, times[index])}
        onChange={(e) => {
          setPlaying(false)
          onChange(times[Number(e.target.value)])
        }}
      />
      <button type="button" className="radar-time-step" aria-label={`Next ${noun} step`} disabled={index >= last} onClick={() => step(1)}>
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
      <div className="wind-legend" aria-label={legend}>
        <span className="wind-legend-bar" style={{ backgroundImage: legendGradient(layer) }} aria-hidden="true" />
        <span className="wind-legend-ticks" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v}>{v}</span>
          ))}
          <span>{unit}</span>
        </span>
        <span className="wind-legend-source">
          {source} ·{' '}
          <a href="https://registry.opendata.aws/noaa-gfs-bdp-pds/">
            {layer === 'wind' ? 'NOAA/NCEP GFS via AWS Open Data' : 'NOAA/NCEP GFS-Wave via AWS Open Data'}
          </a>
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
