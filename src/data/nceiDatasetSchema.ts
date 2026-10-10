import { z } from 'zod'
import { SLUG_PATTERN } from './schemaPrimitives'

const datasetSchema = z.strictObject({
  id: z.string().regex(SLUG_PATTERN, 'must be a lowercase slug'),
  name: z.string().trim().min(1),
  summary: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  frequency: z.string().nullable(),
  formats: z.array(z.string()),
  observationTypes: z.array(z.string()),
  doi: z.string().nullable(),
  /** The curated service node this dataset is reached through. */
  serviceId: z.string().min(1),
})
export type NceiDataset = z.infer<typeof datasetSchema>

export function parseNceiDatasets(raw: unknown): NceiDataset[] {
  return z.array(datasetSchema).parse(raw)
}
