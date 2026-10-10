import { z } from 'zod'

// Schema pieces several schemas share (#351). Each keeps its own strictness: the third-party feeds
// accept any extra coordinate values, NWS alerts exactly two, and graphSchema.ts its own validated
// lon/lat.

/** A third-party GeoJSON position: longitude, latitude and any further values (such as elevation). */
export const feedPosition = z.tuple([z.number(), z.number()]).rest(z.number())
export const feedRing = z.array(feedPosition)

/** Exactly a longitude and a latitude. */
export const lonLatPosition = z.tuple([z.number(), z.number()])

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** An authored id: lowercase words joined by hyphens. */
export const slug = z.string().regex(SLUG_PATTERN, 'must be a lowercase slug (a-z, 0-9, hyphens)')

/** The fields every station snapshot row has (scripts/*-stations.mjs). */
export const stationFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}
