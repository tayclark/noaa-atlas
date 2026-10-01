import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { LonLat } from '../../data/coverageLookup'
import { hasWaves, sampleAt, type ForecastSample, type TideSample } from '../../data/forecastSeries'
import { usePlayer } from './usePlayer'
import { getTimeSnapshot, setRange, setTime, subscribeTime } from '../../data/timeStore'
import { compassPoint, linePath, niceMax, scaleLinear, stepPath, timeToX, type Point } from './forecastChart'
import { loadForecastTimeline, type ForecastTimelineData } from './forecastTimelineData'

const HOUR_MS = 3_600_000
const PLAY_INTERVAL_MS = 500

const W = 600
const LEFT = 4
const RIGHT = 596
const GAP = 12
const AXIS_H = 16

type Props = {
  point: LonLat
  /** Held while the globe is out of sight (#78): a loop nobody can see would only cost battery. */
  paused?: boolean
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: ForecastTimelineData }

const dayLabel = (time: number) => new Date(time).toLocaleDateString([], { weekday: 'short' })
const clockLabel = (time: number) => new Date(time).toLocaleTimeString([], { hour: 'numeric' })
const whenLabel = (time: number) => `${dayLabel(time)} ${clockLabel(time)}`

/** Hours (as sample times) where the local day starts, for the axis. */
function dayStarts(series: ForecastSample[]): number[] {
  return series.filter((s) => new Date(s.time).getHours() === 0).map((s) => s.time)
}

type Row = { key: 'wind' | 'waves' | 'tide'; label: string; top: number; height: number }

function layoutRows(waves: boolean, tide: boolean): { rows: Row[]; height: number } {
  const wanted: Omit<Row, 'top'>[] = [
    { key: 'wind', label: 'Wind, mph', height: 70 },
    ...(waves ? [{ key: 'waves' as const, label: 'Waves, ft', height: 40 }] : []),
    ...(tide ? [{ key: 'tide' as const, label: 'Tide, m', height: 50 }] : []),
  ]
  let top = 4
  const rows = wanted.map((r) => {
    const row = { ...r, top }
    top += r.height + GAP
    return row
  })
  return { rows, height: top - GAP + AXIS_H }
}

// The point forecast timeline (#228): wind, waves and the tide for the tapped point, with a cursor
// that follows the shared time (timeStore), so the radar and this chart scrub together. Playback
// never starts on its own, so a reduced-motion reader only animates by asking for it.
// The caller keys it by the point, so a new point starts again from "loading".
export function ForecastTimeline({ point, paused = false }: Props) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [lng, lat] = point
  const timeState = useSyncExternalStore(subscribeTime, getTimeSnapshot)
  const [isPlayer, setPlaying] = usePlayer('forecast')
  // "Now" is read when the data arrives, not on every render.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    loadForecastTimeline([lng, lat]).then(
      (data) => {
        if (cancelled) return
        setNow(Date.now())
        setLoad({ status: 'ok', data })
      },
      (err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'The forecast could not be loaded.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [lng, lat, attempt])

  const data = load.status === 'ok' ? load.data : null
  const series = data?.series
  const start = series?.[0].time
  const end = series ? series[series.length - 1].time + HOUR_MS : undefined

  // Publish the span so other time-aware layers can clamp to it, and withdraw it with the point.
  useEffect(() => {
    if (start === undefined || end === undefined) return
    setRange({ start, end })
    return () => {
      setRange(null)
      setPlaying(false)
    }
  }, [start, end, setPlaying])

  const last = series ? series.length - 1 : 0
  const cursorTime = timeState.time ?? now
  const index = series && start !== undefined ? Math.min(last, Math.max(0, Math.floor((cursorTime - start) / HOUR_MS))) : 0
  const playing = isPlayer && !paused

  useEffect(() => {
    if (!playing || !series) return
    const timer = setInterval(() => {
      const current = getTimeSnapshot().time ?? Date.now()
      const i = Math.floor((current - series[0].time) / HOUR_MS)
      setTime(series[i >= series.length - 1 ? 0 : Math.max(0, i + 1)].time)
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, series])

  const chart = useMemo(() => (data ? buildChart(data) : null), [data])

  if (load.status === 'loading') {
    return (
      <div className="forecast-timeline" role="status" aria-label="Point forecast timeline">
        Loading the forecast for this point…
      </div>
    )
  }
  if (load.status === 'error') {
    return (
      <div className="forecast-timeline" role="status" aria-label="Point forecast timeline">
        <p>{load.message}</p>
        <button type="button" className="forecast-timeline-retry" onClick={() => {
            setLoad({ status: 'loading' })
            setAttempt((a) => a + 1)
          }}>
          Try again
        </button>
      </div>
    )
  }

  const { series: s, tides, station, tideMessage } = load.data
  const at = s[index]
  const tideAt = sampleAt(tides, at.time)
  const x = chart && timeToX(at.time + HOUR_MS / 2, chart.start, chart.end, LEFT, RIGHT)
  const nowX = chart && timeToX(now, chart.start, chart.end, LEFT, RIGHT)
  const readout = describeSample(at, tideAt)
  const step = (delta: number) => {
    setPlaying(false)
    setTime(s[Math.min(last, Math.max(0, index + delta))].time)
  }

  return (
    <div className="forecast-timeline" role="group" aria-label="Point forecast timeline">
      <div className="forecast-timeline-controls">
        <button
          type="button"
          className="forecast-timeline-play"
          aria-label={isPlayer ? 'Pause forecast loop' : 'Play forecast loop'}
          onClick={() => setPlaying(!isPlayer)}
        >
          {isPlayer ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="forecast-timeline-step"
          aria-label="Previous forecast hour"
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
          aria-label="Forecast hour"
          aria-valuetext={`${whenLabel(at.time)}: ${readout}`}
          onChange={(e) => {
            setPlaying(false)
            setTime(s[Number(e.target.value)].time)
          }}
        />
        <button
          type="button"
          className="forecast-timeline-step"
          aria-label="Next forecast hour"
          disabled={index >= last}
          onClick={() => step(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="forecast-timeline-now"
          disabled={timeState.time === null}
          onClick={() => {
            setPlaying(false)
            setTime(null)
          }}
        >
          Now
        </button>
      </div>
      <p className="forecast-timeline-readout" data-forecast-time={at.time}>
        <strong>{whenLabel(at.time)}</strong> · {readout}
      </p>
      {chart && (
        <svg
          className="forecast-timeline-chart"
          viewBox={`0 0 ${W} ${chart.height}`}
          role="img"
          aria-label={`Wind${chart.waves ? ', waves' : ''}${tides.length ? ' and tide' : ''} for the next ${Math.round(s.length / 24)} days`}
        >
          {chart.days.map((d) => (
            <g key={d.time}>
              <line className="forecast-timeline-day" x1={d.x} x2={d.x} y1={0} y2={chart.height - AXIS_H} />
              <text className="forecast-timeline-axis" x={d.x + 3} y={chart.height - 3}>
                {dayLabel(d.time)}
              </text>
            </g>
          ))}
          {chart.rows.map((row) => (
            <g key={row.key}>
              <text className="forecast-timeline-axis" x={LEFT} y={row.top + 9}>
                {row.label} ({row.scale})
              </text>
              <line className="forecast-timeline-base" x1={LEFT} x2={RIGHT} y1={row.top + row.height} y2={row.top + row.height} />
              {row.key === 'wind' && <path className="forecast-timeline-gust" d={row.gust} />}
              {row.key === 'wind' && <path className="forecast-timeline-wind" d={row.path} />}
              {row.key === 'waves' && <path className="forecast-timeline-waves" d={row.path} />}
              {row.key === 'tide' && <path className="forecast-timeline-tide" d={row.path} />}
            </g>
          ))}
          {nowX !== null && <line className="forecast-timeline-now-marker" x1={nowX} x2={nowX} y1={0} y2={chart.height - AXIS_H} />}
          {x !== null && <line className="forecast-timeline-cursor" x1={x} x2={x} y1={0} y2={chart.height - AXIS_H} />}
        </svg>
      )}
      {!chart?.waves && <p className="forecast-timeline-note">No wave forecast for this point.</p>}
      {station && tideMessage && <p className="forecast-timeline-note">Tide ({station.name}): {tideMessage}</p>}
      {station && !tideMessage && <p className="forecast-timeline-note">Tide: {station.name} (CO-OPS {station.id}).</p>}
    </div>
  )
}

function describeSample(sample: ForecastSample, tide: TideSample | null): string {
  const parts: string[] = []
  if (sample.windMph !== null) {
    const from = sample.windFromDeg === null ? '' : ` ${compassPoint(sample.windFromDeg)}`
    const gust = sample.gustMph !== null && sample.gustMph > sample.windMph ? `, gusts ${Math.round(sample.gustMph)}` : ''
    parts.push(`wind ${Math.round(sample.windMph)} mph${from}${gust}`)
  }
  if (sample.waveFt !== null) parts.push(`waves ${Math.round(sample.waveFt)} ft`)
  if (tide) parts.push(`tide ${tide.metres.toFixed(1)} m`)
  return parts.join(' · ') || 'no data'
}

type ChartRow = Row & { scale: string; path: string; gust: string }

function buildChart(data: ForecastTimelineData) {
  const { series, tides } = data
  const waves = hasWaves(series)
  const { rows, height } = layoutRows(waves, tides.length > 0)
  const start = series[0].time
  const end = series[series.length - 1].time + HOUR_MS
  const x = scaleLinear(start, end, LEFT, RIGHT)
  const hourW = x(start + HOUR_MS) - x(start)
  const out: ChartRow[] = rows.map((row) => {
    const bottom = row.top + row.height
    const pts = (values: (number | null)[], y: (v: number) => number): (Point | null)[] =>
      values.map((v, i) => (v === null ? null : { x: x(series[i].time + HOUR_MS / 2), y: y(v) }))
    if (row.key === 'wind') {
      const peak = Math.max(0, ...series.flatMap((s) => [s.windMph ?? 0, s.gustMph ?? 0]))
      const max = niceMax(peak, 10)
      const y = scaleLinear(0, max, bottom, row.top)
      return { ...row, scale: `0–${max}`, path: linePath(pts(series.map((s) => s.windMph), y)), gust: linePath(pts(series.map((s) => s.gustMph), y)) }
    }
    if (row.key === 'waves') {
      const max = niceMax(Math.max(0, ...series.map((s) => s.waveFt ?? 0)), 2)
      const y = scaleLinear(0, max, bottom, row.top)
      const steps = series.map((s, i) => (s.waveFt === null ? null : { x: x(series[i].time), y: y(s.waveFt) }))
      return { ...row, scale: `0–${max}`, path: stepPath(steps, hourW), gust: '' }
    }
    const low = Math.min(...tides.map((t) => t.metres))
    const high = Math.max(...tides.map((t) => t.metres))
    const y = scaleLinear(low, high, bottom, row.top)
    const curve = tides.map((t) => ({ x: x(t.time), y: y(t.metres) }))
    return { ...row, scale: `${low.toFixed(1)}–${high.toFixed(1)}`, path: linePath(curve), gust: '' }
  })
  const days = dayStarts(series).map((time) => ({ time, x: x(time) }))
  return { rows: out, height, start, end, days, waves }
}
