// Parser for the `.idx` sidecar that NCEP publishes beside every GRIB2 file (#229). Each line is
// `<n>:<byte offset>:d=<YYYYMMDDHH>:<NAME>:<level>:<forecast>:`, so a field can be fetched with a
// single HTTP Range request instead of downloading the whole 40 MB file.

export interface GribIdxEntry {
  name: string
  level: string
  forecast: string
  /** First byte of the message. */
  start: number
  /** Last byte of the message (inclusive), or null for the final message in the file. */
  end: number | null
}

export function parseGribIdx(text: string): GribIdxEntry[] {
  const rows: Omit<GribIdxEntry, 'end'>[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(':')
    if (parts.length < 6) continue
    const start = Number(parts[1])
    if (!Number.isInteger(start) || start < 0) continue
    rows.push({ name: parts[3], level: parts[4], forecast: parts[5], start })
  }
  return rows.map((row, i) => ({ ...row, end: i + 1 < rows.length ? rows[i + 1].start - 1 : null }))
}

/** The entry for `name` at `level` (for example `UGRD` at `10 m above ground`), or undefined. */
export function findGribField(entries: GribIdxEntry[], name: string, level: string): GribIdxEntry | undefined {
  return entries.find((e) => e.name === name && e.level === level)
}

/** The HTTP Range header value for an entry. */
export function rangeHeader(entry: GribIdxEntry): string {
  return `bytes=${entry.start}-${entry.end ?? ''}`
}
