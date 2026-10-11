// Time constants and UTC formatting shared by the clients and the globe's time-aware layers.

export const HOUR_MS = 3_600_000

/** The UTC calendar day of an instant as "YYYYMMDD", the form GFS paths and CO-OPS dates use. */
export function utcYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replaceAll('-', '')
}
