// Whether a looked-up point is in a hurricane's impact zone (#344): inside an active storm's forecast
// cone, or under an NWS tropical watch or warning. The full storm view is offered only then, rather
// than opening whenever the NHC node is selected. Pure, so it's unit-tested.

import type { Coverage } from '../../data/graphSchema'
import { isPointInCoverage, type LonLat } from '../../data/coverageLookup'
import { wrapLon } from '../../data/lonArc'
import type { StormTrack } from './stormTrack'

/** NWS events that put a place in a tropical cyclone's way, most urgent first. */
export const TROPICAL_ALERT_EVENTS: readonly string[] = [
  'Hurricane Warning',
  'Storm Surge Warning',
  'Tropical Storm Warning',
  'Hurricane Watch',
  'Storm Surge Watch',
  'Tropical Storm Watch',
]

type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }

/** An alert polygon as the globe holds it; only the event name and geometry matter here. */
export interface ImpactAlert {
  event: string
  geometry: Geometry | null
}

export interface StormImpact {
  bin: string
  name: string
  /** The most urgent tropical watch or warning over the point, if any. */
  alertEvent: string | null
  inCone: boolean
}

const asCoverage = (g: Geometry): Coverage =>
  g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map((ring) => ring.map(([lon, lat]) => [lon as number, lat as number] as [number, number])) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [lon as number, lat as number] as [number, number]))) }

/** Squared distance in degrees, longitude scaled by latitude and taken the short way round: only used to rank storms. */
function nearness(point: LonLat, track: StormTrack): number {
  const fix = track.fixes.find((f) => f.t >= track.advisoryTime) ?? track.fixes[track.fixes.length - 1]
  if (!fix) return Number.POSITIVE_INFINITY
  const dLon = wrapLon(fix.lon - point[0]) * Math.cos((point[1] * Math.PI) / 180)
  return dLon * dLon + (fix.lat - point[1]) ** 2
}

/**
 * The storm that may affect `point`, or null. A cone that holds the point names its storm; a tropical
 * alert alone (outside every cone, e.g. a coast just beyond it) is put down to the nearest active storm.
 * With no active storms there is nothing to show, whatever the alerts say.
 */
export function stormImpactAt(point: LonLat, tracks: readonly StormTrack[], alerts: readonly ImpactAlert[]): StormImpact | null {
  if (tracks.length === 0) return null
  const coneStorm = tracks.find((track) => track.cone !== null && isPointInCoverage(asCoverage(track.cone), point))
  const alertEvent =
    TROPICAL_ALERT_EVENTS.find((event) =>
      alerts.some((alert) => alert.event === event && alert.geometry !== null && isPointInCoverage(asCoverage(alert.geometry), point)),
    ) ?? null
  if (!coneStorm && !alertEvent) return null
  const storm = coneStorm ?? [...tracks].sort((a, b) => nearness(point, a) - nearness(point, b))[0]
  if (!storm) return null
  return { bin: storm.bin, name: storm.name, alertEvent, inCone: coneStorm !== undefined }
}

/** The prompt's lines: who, and why this place. */
export function describeStormImpact(impact: StormImpact): { title: string; reason: string } {
  const title = `${impact.name} may affect this location`
  if (impact.alertEvent && impact.inCone) return { title, reason: `A ${impact.alertEvent} is in effect here, inside the storm's forecast cone.` }
  if (impact.alertEvent) return { title, reason: `A ${impact.alertEvent} is in effect here.` }
  return { title, reason: "It is inside the storm's 5-day forecast cone." }
}
