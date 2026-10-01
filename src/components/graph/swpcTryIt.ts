// Formatted live results for the SWPC nodes without a map layer (#240): each loader fetches through
// swpcClient (so the call is in the Inspector) and reduces the payload to a small table for the
// detail panel.

import { getGoesXrays, getNoaaScales, getSolarWind, getSpaceWeatherAlerts } from '../../data/swpcClient'
import type { SwpcAlerts, SwpcScaleCell, SwpcScales, SwpcSolarWind, SwpcXrays } from '../../data/swpcSchema'

export interface TryItTable {
  caption: string
  columns: string[]
  rows: string[][]
}

const ALERT_ROWS = 8
const SERIES_ROWS = 12
const SERIES_STEP = 5

const SCALE_PERIODS: Record<string, string> = { '-1': 'Past 24 hours', '0': 'Now' }

function scaleCell(letter: string, cell: SwpcScaleCell): string {
  if (cell.Scale !== null) return `${letter}${cell.Scale} ${cell.Text ?? ''}`.trim()
  const probs = [
    cell.MinorProb != null ? `${cell.MinorProb}% minor` : null,
    cell.MajorProb != null ? `${cell.MajorProb}% major` : null,
    cell.Prob != null ? `${cell.Prob}%` : null,
  ].filter((p) => p !== null)
  return probs.length > 0 ? probs.join(', ') : 'n/a'
}

export function scalesTable(scales: SwpcScales): TryItTable {
  const rows = Object.entries(scales)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([key, day]) => [
      SCALE_PERIODS[key] ?? `Forecast ${day.DateStamp}`,
      scaleCell('R', day.R),
      scaleCell('S', day.S),
      scaleCell('G', day.G),
    ])
  return { caption: 'NOAA space weather scales', columns: ['Period', 'Radio blackout', 'Radiation storm', 'Geomagnetic'], rows }
}

/** The line after "Issue Time:" in an alert message, e.g. "WATCH: Geomagnetic Storm Category G1 Predicted". */
function alertSubject(message: string): string {
  const lines = message.split(/\r?\n/).map((line) => line.trim())
  const at = lines.findIndex((line) => line.startsWith('Issue Time:'))
  return lines.slice(at + 1).find((line) => line !== '') ?? lines[0] ?? ''
}

export function alertsTable(alerts: SwpcAlerts): TryItTable {
  const rows = [...alerts]
    .sort((a, b) => b.issue_datetime.localeCompare(a.issue_datetime))
    .slice(0, ALERT_ROWS)
    .map((alert) => [alert.issue_datetime.slice(0, 16), alert.product_id, alertSubject(alert.message)])
  return { caption: `Latest ${rows.length} alerts, watches and warnings (UTC)`, columns: ['Issued', 'Product', 'Message'], rows }
}

function everyNth<T>(rows: readonly T[]): T[] {
  return rows.filter((_, i) => i % SERIES_STEP === 0).slice(0, SERIES_ROWS)
}

export function solarWindTable(rows: SwpcSolarWind): TryItTable {
  const source = rows[0]?.source ?? 'no active spacecraft'
  return {
    caption: `Solar wind at L1, ${source}, every ${SERIES_STEP} minutes (UTC)`,
    columns: ['Time', 'Speed (km/s)', 'Density (p/cm³)', 'Temperature (K)'],
    rows: everyNth(rows).map((r) => [
      r.time_tag.slice(11, 16),
      String(r.proton_speed),
      r.proton_density === null ? 'n/a' : String(r.proton_density),
      r.proton_temperature === null ? 'n/a' : String(Math.round(r.proton_temperature)),
    ]),
  }
}

/** The GOES flare class for a 0.1-0.8 nm flux in W/m²: A, B, C, M or X with a one-decimal multiplier. */
export function flareClass(flux: number): string {
  const classes = [
    ['X', 1e-4],
    ['M', 1e-5],
    ['C', 1e-6],
    ['B', 1e-7],
  ] as const
  const [letter, floor] = classes.find(([, f]) => flux >= f) ?? (['A', 1e-8] as const)
  return `${letter}${(flux / floor).toFixed(1)}`
}

const LONG_BAND = '0.1-0.8nm'
const SHORT_BAND = '0.05-0.4nm'

export function xraysTable(rows: SwpcXrays): TryItTable {
  const byTime = new Map<string, { long?: number | null; short?: number | null }>()
  for (const row of rows) {
    const entry = byTime.get(row.time_tag) ?? {}
    if (row.energy === LONG_BAND) entry.long = row.flux
    if (row.energy === SHORT_BAND) entry.short = row.flux
    byTime.set(row.time_tag, entry)
  }
  const times = [...byTime.keys()].sort().reverse()
  const flux = (v: number | null | undefined) => (v == null ? 'n/a' : v.toExponential(2))
  return {
    caption: `GOES-${rows[0]?.satellite ?? '?'} X-ray flux, every ${SERIES_STEP} minutes (UTC)`,
    columns: ['Time', '0.1-0.8 nm (W/m²)', 'Flare class', '0.05-0.4 nm (W/m²)'],
    rows: everyNth(times).map((time) => {
      const { long, short } = byTime.get(time) ?? {}
      return [time.slice(11, 16), flux(long), long == null ? 'n/a' : flareClass(long), flux(short)]
    }),
  }
}

/** Node id to the loader its detail panel's "Run sample" button runs; each returns one or more tables. */
export const SWPC_TRY_ITS: Readonly<Partial<Record<string, () => Promise<TryItTable[]>>>> = {
  'swpc-alerts-scales': async () => {
    const [scales, alerts] = await Promise.all([getNoaaScales(), getSpaceWeatherAlerts()])
    return [scalesTable(scales), alertsTable(alerts)]
  },
  'swpc-rtsw-solar-wind': async () => [solarWindTable(await getSolarWind())],
  'swpc-goes-space-environment': async () => [xraysTable(await getGoesXrays())],
}
