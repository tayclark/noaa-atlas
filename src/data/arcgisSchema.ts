import { z } from 'zod'

// Schema for an ArcGIS MapServer `/legend?f=json` response (#247; see the nws-raster-map-services node
// in graph.json). As in spcSchema.ts this uses z.object, not z.strictObject: it's a third-party
// feed and only the fields the globe legend consumes are modelled. `imageData` is a base64 PNG swatch.

const legendEntrySchema = z.object({
  label: z.string(),
  imageData: z.string(),
  contentType: z.string(),
})

const legendSchema = z.object({
  layers: z.array(
    z.object({
      layerId: z.number(),
      layerName: z.string(),
      legend: z.array(legendEntrySchema),
    }),
  ),
})

export type ArcgisLegend = z.infer<typeof legendSchema>
export type ArcgisLegendEntry = z.infer<typeof legendEntrySchema>

export function parseArcgisLegend(raw: unknown): ArcgisLegend {
  return legendSchema.parse(raw)
}
