import type { Coverage, ServiceNode } from './graphSchema'

export type LonLat = readonly [number, number]

// Rings are always closed (first position repeated at the end) per the graph schema,
// so the classic PNPOLY loop below naturally handles that without special-casing it.
// Antimeridian-crossing polygons are not special-cased — no current node's coverage
// needs it, but a future Pacific-crossing coverage area would require handling it.
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
export function isPointInCoverage(coverage: Coverage, point: LonLat): boolean {
  if (coverage.type === 'Polygon') return isPointInPolygon(point, coverage.coordinates)
  return coverage.coordinates.some((polygon) => isPointInPolygon(point, polygon))
}

/** Filters service nodes to those whose coverage includes the given point. */
export function nodesCoveringPoint(nodes: readonly ServiceNode[], point: LonLat): ServiceNode[] {
  return nodes.filter((node) => isPointInCoverage(node.coverage, point))
}
