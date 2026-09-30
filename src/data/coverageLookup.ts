import type { Coverage, ServiceNode } from './graphSchema'
import { wrapLon } from './lonArc'

export type LonLat = readonly [number, number]

// Rings are always closed (first position repeated at the end) per the graph schema,
// so the classic PNPOLY loop below naturally handles that without special-casing it.
// Stored rings never cross the antimeridian (the preset tooling splits them at ±180), so they need
// no special case; instead the tested point is wrapped into [-180, 180], because a click on a
// repeated copy of the world reports a longitude outside that range (#80).
function isPointInRing(point: LonLat, ring: readonly LonLat[]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function isPointInPolygon(point: LonLat, rings: readonly (readonly LonLat[])[]): boolean {
  const [outer, ...holes] = rings
  return isPointInRing(point, outer) && !holes.some((hole) => isPointInRing(point, hole))
}

/** Tests whether a WGS84 [lon, lat] point falls inside a coverage geometry (Polygon or MultiPolygon, holes included). */
export function isPointInCoverage(coverage: Coverage, [lon, lat]: LonLat): boolean {
  const point: LonLat = [wrapLon(lon), lat]
  if (coverage.type === 'Polygon') return isPointInPolygon(point, coverage.coordinates)
  return coverage.coordinates.some((polygon) => isPointInPolygon(point, polygon))
}

/** Filters service nodes to those whose coverage includes the given point. */
export function nodesCoveringPoint(nodes: readonly ServiceNode[], point: LonLat): ServiceNode[] {
  return nodes.filter((node) => isPointInCoverage(node.coverage, point))
}
