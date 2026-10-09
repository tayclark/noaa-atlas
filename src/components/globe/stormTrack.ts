// Pure helpers for the NHC storm track layer (#334). Kept out of MapLibreGlobe.tsx so the time
// parsing, the merge of observed and forecast fixes, the interpolation the play control scrubs
// through and the drawn features are unit-tested. A storm is keyed by its NHC bin (AT1-5, EP1-5, CP1-5).

import { smallestLonArc, wrapLon } from '../../data/lonArc'
import { NhcHttpError, NhcParseError, type NhcStormData } from '../../data/nhcClient'
import type { NhcForecastPoint, NhcPastPoint } from '../../data/nhcSchema'
import type { Bounds } from './coverageFlyTarget'
import { escapeHtml } from './popupHtml'

const HOUR_MS = 3_600_000

// Declared here rather than imported from 'geojson', as in selectionGlobeView.ts: @types/geojson
// would tighten maplibre-gl's own GeoJSON typings.
type Position = [number, number]
type Polygon = { type: 'Polygon'; coordinates: number[][][] }
type MultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] }
type LineString = { type: 'LineString'; coordinates: Position[] }
type Point = { type: 'Point'; coordinates: Position }
type Feature<G> = { type: 'Feature'; properties: Record<string, unknown>; geometry: G }

export interface StormFeatureCollection {
  type: 'FeatureCollection'
  features: Feature<Polygon | MultiPolygon | LineString | Point>[]
}

export interface StormFix {
  /** Epoch ms (UTC). */
  t: number
  lon: number
  lat: number
  windKt: number
  /** What NHC called the system at this fix, e.g. "Tropical Storm" or "Post-tropical". */
  label: string
  forecast: boolean
}

export interface StormTrack {
  bin: string
  /** Display name from the advisory, e.g. "Hurricane Isaias". */
  name: string
  /** Observed fixes, then the latest advisory's forecast fixes, oldest first. */
  fixes: StormFix[]
  /** The advisory's own time (its tau 0 fix): where the observed track ends and the forecast starts. */
  advisoryTime: number
  cone: Polygon | MultiPolygon | null
}

export interface StormState {
  t: number
  lon: number
  lat: number
  windKt: number
  label: string
  forecast: boolean
}

export interface StormCategory {
  key: string
  name: string
  /** Lowest sustained wind (kt) in this category. */
  minKt: number
  color: string
}

/** Saffir-Simpson, plus the two tropical bands below it, weakest first. */
export const STORM_CATEGORIES: readonly StormCategory[] = [
  { key: 'TD', name: 'Depression', minKt: 0, color: '#5EBAFF' },
  { key: 'TS', name: 'Tropical storm', minKt: 34, color: '#00FAF4' },
  { key: '1', name: 'Category 1', minKt: 64, color: '#FFF795' },
  { key: '2', name: 'Category 2', minKt: 83, color: '#FFD821' },
  { key: '3', name: 'Category 3', minKt: 96, color: '#FF8F20' },
  { key: '4', name: 'Category 4', minKt: 113, color: '#FF6060' },
  { key: '5', name: 'Category 5', minKt: 137, color: '#C464D9' },
]

/** NHC's best-track system types (`stormtype` on the past points). */
const PAST_TYPE_LABELS: Readonly<Record<string, string>> = {
  DB: 'Disturbance',
  LO: 'Low',
  WV: 'Tropical wave',
  TD: 'Tropical depression',
  TS: 'Tropical storm',
  HU: 'Hurricane',
  MH: 'Major hurricane',
  SD: 'Subtropical depression',
  SS: 'Subtropical storm',
  EX: 'Post-tropical',
  PT: 'Post-tropical',
}

export function categoryFor(windKt: number): StormCategory {
  let found = STORM_CATEGORIES[0] as StormCategory
  for (const category of STORM_CATEGORIES) if (windKt >= category.minKt) found = category
  return found
}

/** A category's short label for the control: "Cat 3", "TS" or "TD". */
export function categoryLabel(category: StormCategory): string {
  return /^\d$/.test(category.key) ? `Cat ${category.key}` : category.key
}

/** Best-track `dtg` (YYYYMMDDHH, UTC) to epoch ms. */
export function parseDtg(dtg: number): number {
  const s = String(dtg).padStart(10, '0')
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10)))
}

/**
 * Forecast `validtime` (DD/HHMM, UTC) to epoch ms. It carries no month or year, so they come from the
 * advisory file's date: the forecast runs at most 5 days on, so a day number far from the file's
 * day has crossed a month end (either way, since tau 0 can sit just before the file was written).
 */
export function parseValidTime(validtime: string, fileTime: number): number {
  const match = /^(\d{1,2})\/(\d{2})(\d{2})$/.exec(validtime.trim())
  if (!match) return Number.NaN
  const [, day, hour, minute] = match.map(Number) as [number, number, number, number]
  const file = new Date(fileTime)
  const at = (monthOffset: number) =>
    Date.UTC(file.getUTCFullYear(), file.getUTCMonth() + monthOffset, day, hour, minute)
  // A day the month doesn't have (31 in a 30-day month) rolls over in Date.UTC, so those are dropped.
  const candidates = [at(-1), at(0), at(1)].filter((t) => new Date(t).getUTCDate() === day)
  if (candidates.length === 0) return Number.NaN
  return candidates.reduce((best, t) => (Math.abs(t - fileTime) < Math.abs(best - fileTime) ? t : best))
}

function titleCase(name: string): string {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function pointLonLat(point: NhcPastPoint | NhcForecastPoint): [number, number] {
  const [lon, lat] = point.geometry.coordinates
  return [lon, lat]
}

/** Groups the three layers by storm, oldest fix first, most intense storm (at its advisory) first. */
export function buildStormTracks({ past, forecast, cones }: NhcStormData): StormTrack[] {
  const bins = new Set([...past.features, ...forecast.features].map((f) => f.properties.binnumber))
  const tracks: StormTrack[] = []
  for (const bin of bins) {
    const ahead = forecast.features
      .filter((f) => f.properties.binnumber === bin)
      .map((f): StormFix => {
        const [lon, lat] = pointLonLat(f)
        const t = parseValidTime(f.properties.validtime, f.properties.idp_filedate)
        return { t, lon, lat, windKt: f.properties.maxwind, label: f.properties.tcdvlp, forecast: true }
      })
      .filter((fix) => Number.isFinite(fix.t))
      .sort((a, b) => a.t - b.t)
    const pastForBin = past.features.filter((f) => f.properties.binnumber === bin)
    const observed = pastForBin
      .map((f): StormFix => {
        const [lon, lat] = pointLonLat(f)
        const type = f.properties.stormtype
        return { t: parseDtg(f.properties.dtg), lon, lat, windKt: f.properties.intensity, label: PAST_TYPE_LABELS[type] ?? type, forecast: false }
      })
      .sort((a, b) => a.t - b.t)
    // The advisory's tau 0 is the latest position; an observed fix at or after it would only repeat it.
    const advisoryTime = ahead[0]?.t ?? observed[observed.length - 1]?.t
    if (advisoryTime === undefined) continue
    const fixes = ahead.length > 0 ? [...observed.filter((fix) => fix.t < advisoryTime), ...ahead] : observed
    const forecastName = forecast.features.find((f) => f.properties.binnumber === bin)?.properties.stormname
    const lastPastName = pastForBin[pastForBin.length - 1]?.properties.stormname ?? bin
    const cone = cones.features.find((f) => f.properties.binnumber === bin)?.geometry ?? null
    tracks.push({ bin, name: forecastName ?? titleCase(lastPastName), fixes, advisoryTime, cone })
  }
  const strength = (track: StormTrack) => stateAt(track, track.advisoryTime).windKt
  return tracks.sort((a, b) => strength(b) - strength(a) || a.bin.localeCompare(b.bin))
}

/** Longitude difference b - a, the short way round. */
function lonDelta(a: number, b: number): number {
  const d = b - a
  return d > 180 ? d - 360 : d < -180 ? d + 360 : d
}

/** The storm at time t, interpolated linearly between the fixes either side (clamped to the track's ends). */
export function stateAt(track: StormTrack, t: number): StormState {
  const { fixes } = track
  const first = fixes[0] as StormFix
  const last = fixes[fixes.length - 1] as StormFix
  const at = (fix: StormFix): StormState => ({ ...fix, t, forecast: t > track.advisoryTime, lon: wrapLon(fix.lon) })
  if (t <= first.t) return at(first)
  if (t >= last.t) return at(last)
  let i = 0
  while ((fixes[i + 1] as StormFix).t < t) i++
  const a = fixes[i] as StormFix
  const b = fixes[i + 1] as StormFix
  const f = (t - a.t) / (b.t - a.t)
  return {
    t,
    lon: wrapLon(a.lon + f * lonDelta(a.lon, b.lon)),
    lat: a.lat + f * (b.lat - a.lat),
    windKt: a.windKt + f * (b.windKt - a.windKt),
    label: (f < 0.5 ? a : b).label,
    forecast: t > track.advisoryTime,
  }
}

/** The slider's stops: every hour from the first fix to the last, plus each fix's own time. */
export function frameTimes(track: StormTrack): number[] {
  const first = (track.fixes[0] as StormFix).t
  const last = (track.fixes[track.fixes.length - 1] as StormFix).t
  const times = new Set<number>(track.fixes.map((fix) => fix.t))
  for (let t = first; t < last; t += HOUR_MS) times.add(t)
  return [...times].sort((a, b) => a - b)
}

/** The frame showing the advisory itself, where playback and a newly chosen storm start. */
export function advisoryFrameIndex(frames: readonly number[], track: StormTrack): number {
  const i = frames.findIndex((t) => t >= track.advisoryTime)
  return i === -1 ? frames.length - 1 : i
}

/** The frame index of the fix before (-1) or after (+1) the given frame, for the step buttons. */
export function stepToFix(frames: readonly number[], track: StormTrack, index: number, direction: -1 | 1): number {
  const now = frames[index] ?? 0
  const target =
    direction === 1 ? track.fixes.find((fix) => fix.t > now)?.t : [...track.fixes].reverse().find((fix) => fix.t < now)?.t
  if (target === undefined) return index
  return Math.max(0, frames.indexOf(target))
}

/** Longitudes made continuous across the antimeridian, so a line crossing it isn't drawn the long way round. */
function unwrapped(fixes: readonly StormFix[]): [number, number][] {
  const coords: [number, number][] = []
  let lon = 0
  for (const [i, fix] of fixes.entries()) {
    lon = i === 0 ? fix.lon : lon + lonDelta(coords[i - 1]?.[0] ?? fix.lon, fix.lon)
    coords.push([lon, fix.lat])
  }
  return coords
}

function line(kind: string, bin: string, selected: boolean, fixes: readonly StormFix[]): Feature<LineString>[] {
  if (fixes.length < 2) return []
  return [{ type: 'Feature', properties: { kind, bin, selected }, geometry: { type: 'LineString', coordinates: unwrapped(fixes) } }]
}

/**
 * Everything the layer draws: each storm's cone, observed track (solid) and forecast track (dashed),
 * its fixes coloured by category, and for the chosen storm a bold trail up to time t and a marker at t.
 */
export function trackFeatures(tracks: readonly StormTrack[], selectedBin: string | null, t: number | null): StormFeatureCollection {
  const features: StormFeatureCollection['features'] = []
  for (const track of tracks) {
    const selected = track.bin === selectedBin
    if (track.cone) features.push({ type: 'Feature', properties: { kind: 'cone', bin: track.bin, selected }, geometry: track.cone })
    const observed = track.fixes.filter((fix) => !fix.forecast)
    const ahead = track.fixes.filter((fix) => fix.forecast)
    // The forecast line starts from the last observed fix so the two lines meet.
    const join = observed[observed.length - 1]
    features.push(...line('past', track.bin, selected, observed))
    features.push(...line('forecast', track.bin, selected, join ? [join, ...ahead] : ahead))
    for (const fix of track.fixes) {
      features.push({
        type: 'Feature',
        properties: {
          kind: 'fix',
          bin: track.bin,
          selected,
          color: categoryFor(fix.windKt).color,
          name: track.name,
          t: fix.t,
          windKt: fix.windKt,
          label: fix.label,
          forecast: fix.forecast,
        },
        geometry: { type: 'Point', coordinates: [wrapLon(fix.lon), fix.lat] },
      })
    }
    if (!selected || t === null) continue
    const state = stateAt(track, t)
    const reached = track.fixes.filter((fix) => fix.t < t)
    features.push(...line('trail', track.bin, true, [...reached, { ...state, forecast: state.forecast }]))
    const marker: Feature<Point> = {
      type: 'Feature',
      properties: { kind: 'marker', bin: track.bin, selected: true, color: categoryFor(state.windKt).color },
      geometry: { type: 'Point', coordinates: [state.lon, state.lat] },
    }
    features.push(marker)
  }
  return { type: 'FeatureCollection', features }
}

/** Bounds framing a storm's whole track and cone, the short way round the antimeridian. */
export function stormBounds(track: StormTrack): Bounds | null {
  const points: [number, number][] = track.fixes.map((fix) => [fix.lon, fix.lat])
  if (track.cone) {
    const polygons = track.cone.type === 'Polygon' ? [track.cone.coordinates] : track.cone.coordinates
    for (const polygon of polygons) for (const [lon, lat] of polygon[0] ?? []) points.push([lon as number, lat as number])
  }
  const arc = smallestLonArc(points.map(([lon]) => [wrapLon(lon), wrapLon(lon)] as const))
  if (!arc) return null
  const lats = points.map(([, lat]) => lat)
  return [arc.west, Math.min(...lats), arc.east, Math.max(...lats)]
}

export interface FramingPadding {
  top: number
  bottom: number
  left: number
  right: number
}

const FRAMING_MARGIN = 24

/**
 * fitBounds padding that keeps a storm clear of the overlays over the globe: the selection card at
 * the top and the play control and legend at the bottom (insets in px from each edge). Each side
 * is capped so the storm always keeps at least a third of the height, since MapLibre can't fit
 * bounds into padding that leaves no room.
 */
export function framingPadding(size: { width: number; height: number }, topInset: number, bottomInset: number): FramingPadding {
  const room = size.height / 3
  const top = Math.max(FRAMING_MARGIN, topInset + FRAMING_MARGIN)
  const bottom = Math.max(FRAMING_MARGIN, bottomInset + FRAMING_MARGIN)
  const scale = top + bottom > size.height - room ? (size.height - room) / (top + bottom) : 1
  const side = Math.min(60, size.width / 8)
  return { top: Math.floor(top * scale), bottom: Math.floor(bottom * scale), left: side, right: side }
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }

const STORM_CLASS_PREFIX = /^(?:major |post-tropical |potential |subtropical |remnants of )*(?:hurricane|tropical storm|tropical depression|tropical cyclone|storm|depression|cyclone)\s+/i

/** The storm's own name without its class, for the chips: "Hurricane Isaias" → "Isaias". */
export function shortStormName(name: string): string {
  return name.replace(STORM_CLASS_PREFIX, '') || name
}

/** "Fri 9 Oct, 15:00 UTC". UTC because that's how NHC times its fixes. */
export function formatStormTime(t: number): string {
  return `${new Date(t).toLocaleString('en-GB', DATE_FORMAT)} UTC`
}

/** "12 h after the advisory" / "advisory" / "18 h before the advisory", rounded to the hour. */
export function formatAdvisoryOffset(t: number, advisoryTime: number): string {
  const hours = Math.round((t - advisoryTime) / HOUR_MS)
  if (hours === 0) return 'latest advisory'
  return hours > 0 ? `forecast +${hours} h` : `${-hours} h before advisory`
}

/** The control's readout for the storm at time t. */
export function describeStormState(state: StormState): string {
  const category = categoryFor(state.windKt)
  // Below tropical storm strength NHC's own name ("Disturbance", "Post-tropical") says more than "TD".
  const name = category.key === 'TD' ? state.label : categoryLabel(category)
  return `${Math.round(state.windKt)} kt, ${name}`
}

/** The click popup for one fix. */
export function formatFixPopupHtml(properties: Record<string, unknown>): string {
  const t = Number(properties.t)
  const wind = Number(properties.windKt)
  return [
    `<strong>${escapeHtml(String(properties.name ?? ''))}</strong>`,
    `${escapeHtml(formatStormTime(t))}${properties.forecast ? ' (forecast)' : ''}`,
    `${escapeHtml(String(properties.label ?? ''))}, ${wind} kt (${escapeHtml(categoryFor(wind).name)})`,
  ].join('<br/>')
}

/** The categories a set of storms reaches, weakest first, for a legend that matches the map. */
export function categoriesInTracks(tracks: readonly StormTrack[]): StormCategory[] {
  const present = new Set(tracks.flatMap((track) => track.fixes.map((fix) => categoryFor(fix.windKt).key)))
  return STORM_CATEGORIES.filter((c) => present.has(c.key))
}

/** A human-readable message for a failed fetch, by error kind. */
export function describeNhcFetchOutcome(err: unknown): string {
  if (err instanceof NhcHttpError) return 'The NHC map service is unavailable, the storm tracks could not be loaded.'
  if (err instanceof NhcParseError) return 'The NHC map service returned an unexpected response.'
  if (err instanceof TypeError) return 'Could not reach the NHC map service, the storm tracks could not be loaded.'
  return 'Something went wrong loading the storm tracks.'
}
