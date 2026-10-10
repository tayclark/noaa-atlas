import { z } from 'zod'

// Schemas for the two NCEI try-its (#242): the Access Data Service (www.ncei.noaa.gov) and the GOES-R
// space weather archive's directory listings (data.ngdc.noaa.gov). As in coopsSchema.ts these use
// z.object, not z.strictObject: only the fields we consume are modelled.

// ADS sends every value as a string ("25.0", or "  100" without units=metric). A station day can
// lack any element, so each one is optional.
const value = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? null : Number(v)))

const dailySummariesSchema = z.array(
  z.object({
    DATE: z.string(),
    STATION: z.string(),
    NAME: z.string().optional(),
    TMAX: value,
    TMIN: value,
    PRCP: value,
  }),
)

export interface NceiDailySummary {
  /** "YYYY-MM-DD". */
  date: string
  station: string
  name: string | null
  /** °C, or null when the station sent no value. */
  tmax: number | null
  tmin: number | null
  /** mm, or null when the station sent no value. */
  prcp: number | null
}

/** Daily summaries in metric, oldest first as ADS returns them. */
export function parseDailySummaries(raw: unknown): NceiDailySummary[] {
  return dailySummariesSchema.parse(raw).map((row) => ({
    date: row.DATE,
    station: row.STATION,
    name: row.NAME?.trim() || null,
    tmax: row.TMAX,
    tmin: row.TMIN,
    prcp: row.PRCP,
  }))
}

const FILE_ROW = /<a href="([^"/]+\.nc)">[^<]*<\/a><\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g
const TITLE = /<title>([^<]*)<\/title>/

/**
 * The `.nc` rows of an Apache-style directory listing, decoded before validation so the Inspector
 * shows the files rather than the page's HTML. The title is kept so a page that isn't a listing
 * (an error page served with 200) fails the schema instead of reading as an empty folder.
 */
export function parseDirectoryListing(html: string): unknown {
  return {
    title: TITLE.exec(html)?.[1]?.trim() ?? '',
    files: [...html.matchAll(FILE_ROW)].map(([, name, modified, size]) => ({ name, modified: modified.trim(), size: size.trim() })),
  }
}

const listingSchema = z.object({
  title: z.string().startsWith('Index of '),
  files: z.array(
    z.object({
      name: z.string().regex(/_d\d{8}_/),
      modified: z.string(),
      size: z.string(),
    }),
  ),
})

export interface GoesArchiveFile {
  name: string
  /** The day the file covers, "YYYY-MM-DD", from its `_dYYYYMMDD_` part. */
  dataDate: string
  /** When the archive posted it, "YYYY-MM-DD HH:mm". */
  modified: string
  /** As the listing prints it, e.g. "288K". */
  size: string
}

export function parseGoesListing(raw: unknown): GoesArchiveFile[] {
  return listingSchema.parse(raw).files.map((file) => {
    const [, y, m, d] = /_d(\d{4})(\d{2})(\d{2})_/.exec(file.name) ?? []
    return { ...file, dataDate: `${y}-${m}-${d}` }
  })
}
