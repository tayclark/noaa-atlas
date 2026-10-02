// ArcGIS overlays on the globe (#247, #246). Each is a MapServer drawn through its `export` endpoint,
// which MapLibre requests as raster tiles (the same `{bbox-epsg-3857}` approach as the nowCOAST
// radar). Nothing is requested until the node is selected. MapLibre owns the image fetches, so only
// the legend JSON call goes through the typed client and shows up in the Inspector.

import { ArcgisHttpError, ArcgisParseError } from '../../data/arcgisClient'
import type { ArcgisLegend, ArcgisLegendEntry } from '../../data/arcgisSchema'
import type { LiveLayerKey } from './liveLayers'

export const ARCGIS_TILE_SIZE = 256

export interface ArcgisOverlay {
  key: Extract<LiveLayerKey, `arcgis-${string}`>
  sourceId: string
  layerId: string
  /** The MapServer URL, without a trailing slash. */
  serviceUrl: string
  /** The sublayers drawn and described by the legend. */
  layerIdsInService: readonly number[]
  opacity: number
  title: string
  attribution: string
}

export const ARCGIS_OVERLAYS: readonly ArcgisOverlay[] = [
  {
    key: 'arcgis-raster',
    sourceId: 'arcgis-raster',
    layerId: 'arcgis-raster-layer',
    serviceUrl: 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/rfc_qpe/MapServer',
    layerIdsInService: [28],
    opacity: 0.7,
    title: 'Last 24 hours of rain and melt (inches)',
    attribution: 'Precipitation: <a href="https://www.weather.gov/gis/">NOAA/NWS River Forecast Centers</a>',
  },
  {
    key: 'arcgis-vector',
    sourceId: 'arcgis-vector',
    layerId: 'arcgis-vector-layer',
    serviceUrl: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_6_10_day_outlk/MapServer',
    layerIdsInService: [0],
    opacity: 0.6,
    title: '6-10 day temperature outlook',
    attribution: 'Outlook: <a href="https://www.cpc.ncep.noaa.gov/">NOAA/NWS Climate Prediction Center</a>',
  },
  {
    key: 'arcgis-charts',
    sourceId: 'arcgis-charts',
    layerId: 'arcgis-charts-layer',
    serviceUrl: 'https://gis.charttools.noaa.gov/arcgis/rest/services/MarineChart_Services/NOAACharts/MapServer',
    layerIdsInService: [0],
    opacity: 0.85,
    title: 'NOAA nautical charts (not for navigation)',
    attribution: 'Charts: <a href="https://nauticalcharts.noaa.gov/">NOAA Office of Coast Survey</a>',
  },
  {
    key: 'arcgis-habitat',
    sourceId: 'arcgis-habitat',
    layerId: 'arcgis-habitat-layer',
    serviceUrl: 'https://maps.fisheries.noaa.gov/server/rest/services/All_NMFS_Critical_Habitat/MapServer',
    // The merged polygon and line rollups of the 96 per-species layers.
    layerIdsInService: [226, 2],
    opacity: 0.6,
    title: 'ESA critical habitat (indicative, not official boundaries)',
    attribution: 'Critical habitat: <a href="https://www.fisheries.noaa.gov/">NOAA Fisheries</a>',
  },
]

/** `{bbox-epsg-3857}` is MapLibre's placeholder for each tile's Web Mercator bounding box. */
export function arcgisExportTileUrl(serviceUrl: string, sublayers: readonly number[]): string {
  return (
    `${serviceUrl}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
    `&size=${ARCGIS_TILE_SIZE},${ARCGIS_TILE_SIZE}&format=png32&transparent=true&layers=show:${sublayers.join(',')}&f=image`
  )
}

/**
 * The legend entries for the overlay's sublayers. Empty when the service doesn't describe them.
 * Entries without a label (the critical habitat swatches) are dropped: a bare chip says nothing.
 */
export function legendEntriesFor(legend: ArcgisLegend, sublayers: readonly number[]): ArcgisLegendEntry[] {
  return legend.layers
    .filter((l) => sublayers.includes(l.layerId))
    .flatMap((l) => l.legend)
    .filter((entry) => entry.contentType === 'image/png' && entry.label.trim() !== '')
}

/** A human-readable message for a failed legend fetch, by error kind. */
export function describeArcgisFetchOutcome(err: unknown): string {
  if (err instanceof ArcgisHttpError) return 'The map service is unavailable, so the legend could not be loaded.'
  if (err instanceof ArcgisParseError) return 'The map service returned an unexpected legend response.'
  if (err instanceof TypeError) return 'Could not reach the map service, so the legend could not be loaded.'
  return 'Something went wrong loading the legend.'
}
