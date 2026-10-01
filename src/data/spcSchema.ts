import { z } from 'zod'

// Schema for the SPC GIS GeoJSON outlook files (#245; see the spc-gis-data node in graph.json). As in
// nwsSchema.ts and swpcSchema.ts this uses z.object, not z.strictObject: it's a third-party feed and
// only the fields we consume are modelled. `fill` and `stroke` are SPC's own hex colours per category.

const position = z.tuple([z.number(), z.number()]).rest(z.number())
const ring = z.array(position)

const polygonGeometry = z.object({ type: z.literal('Polygon'), coordinates: z.array(ring) })
const multiPolygonGeometry = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring)) })

const outlookFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.union([polygonGeometry, multiPolygonGeometry]),
  properties: z.object({
    LABEL: z.string(),
    LABEL2: z.string(),
    fill: z.string(),
    stroke: z.string(),
    VALID_ISO: z.iso.datetime({ offset: true }),
    EXPIRE_ISO: z.iso.datetime({ offset: true }),
    FORECASTER: z.string().optional(),
  }),
})

const outlookSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(outlookFeatureSchema),
})

export type SpcOutlook = z.infer<typeof outlookSchema>
export type SpcOutlookFeature = SpcOutlook['features'][number]

export function parseSpcOutlook(raw: unknown): SpcOutlook {
  return outlookSchema.parse(raw)
}
