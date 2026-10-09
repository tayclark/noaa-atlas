// Pure maths for the GFS simulated radar under a hurricane's forecast (#340): composite reflectivity
// (dBZ) coloured with the usual radar scale in 5 dBZ bands, transparent below light rain, and the
// blend weight between the two 3-hourly forecast files either side of a storm slider time.

import { STEP_HOURS } from '../../data/gfsClient'
import { shadeScalarField, type ScalarFieldInput } from './fieldShading'

const STEP_MS = STEP_HOURS * 3_600_000

/** Below this the model's echoes are drizzle or noise, and would only haze the globe. */
export const MIN_DBZ = 15

/** The radar bands from MIN_DBZ up, 5 dBZ each, as NWS radar colours them. */
export const REFLECTIVITY_BANDS: readonly { dbz: number; color: string }[] = [
  { dbz: 15, color: '#0300f4' },
  { dbz: 20, color: '#02fd02' },
  { dbz: 25, color: '#01c501' },
  { dbz: 30, color: '#008e00' },
  { dbz: 35, color: '#fdf802' },
  { dbz: 40, color: '#e5bc00' },
  { dbz: 45, color: '#fd9500' },
  { dbz: 50, color: '#fd0000' },
  { dbz: 55, color: '#d40000' },
  { dbz: 60, color: '#bc0000' },
  { dbz: 65, color: '#f800fd' },
]

const RGB = REFLECTIVITY_BANDS.map(({ color }) => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)))

/** The band index for a reflectivity, or -1 below MIN_DBZ. */
export function bandFor(dbz: number): number {
  if (!(dbz >= MIN_DBZ)) return -1
  return Math.min(REFLECTIVITY_BANDS.length - 1, Math.floor((dbz - MIN_DBZ) / 5))
}

/** RGBA pixels (a Web Mercator image) of the blended reflectivity; dry areas are transparent. */
export function renderReflectivity(width: number, height: number, input: ScalarFieldInput, alpha = 210): Uint8ClampedArray<ArrayBuffer> {
  return shadeScalarField(width, height, input, (out, i, dbz) => {
    const band = bandFor(dbz)
    if (band === -1) return
    const [r, g, b] = RGB[band] as number[]
    out[i] = r as number
    out[i + 1] = g as number
    out[i + 2] = b as number
    out[i + 3] = alpha
  })
}

/** The start of the 3-hour forecast step holding `time`; GFS files fall on these boundaries. */
export function reflectivityStep(time: number): number {
  return Math.floor(time / STEP_MS) * STEP_MS
}

/** How far `time` is through its 3-hour step, 0 to 1, for cross-fading the two files. */
export function reflectivityBlend(time: number): number {
  return (time - reflectivityStep(time)) / STEP_MS
}

/** The readout's note on the simulated radar: which model run, or why there is none yet. */
export function describeReflectivity(status: 'loading' | 'ok' | 'error', cycle: number | null): string {
  if (status === 'error') return 'GFS simulated radar unavailable'
  if (cycle === null) return 'GFS simulated radar loading'
  return `GFS simulated radar, ${String(new Date(cycle).getUTCHours()).padStart(2, '0')}Z run`
}
