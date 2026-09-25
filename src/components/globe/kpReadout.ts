// The planetary Kp readout on the globe (#54). Pure, so the G-scale mapping is unit-tested.

import type { SwpcKp1m } from '../../data/swpcSchema'
import { formatUtcTime } from './auroraLayer'

export interface KpReadout {
  /** The latest one-minute estimate, to one decimal place. */
  kp: string
  gScale: 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5'
  label: string
  time: string
}

// NOAA's geomagnetic storm scale: Kp 5 is G1 (minor) up to Kp 9 is G5 (extreme); below 5 is no storm.
const G_SCALE: readonly { gScale: KpReadout['gScale']; label: string }[] = [
  { gScale: 'G1', label: 'Minor storm' },
  { gScale: 'G2', label: 'Moderate storm' },
  { gScale: 'G3', label: 'Strong storm' },
  { gScale: 'G4', label: 'Severe storm' },
  { gScale: 'G5', label: 'Extreme storm' },
]

export function gScaleFor(kpIndex: number): { gScale: KpReadout['gScale']; label: string } {
  if (kpIndex < 5) return { gScale: 'G0', label: kpIndex >= 4 ? 'Active' : 'Quiet' }
  return G_SCALE[Math.min(Math.floor(kpIndex), 9) - 5]
}

export function describeKp(rows: SwpcKp1m): KpReadout {
  const latest = rows[rows.length - 1]
  return {
    kp: latest.estimated_kp.toFixed(1),
    ...gScaleFor(latest.kp_index),
    // time_tag is UTC without a zone designator.
    time: formatUtcTime(`${latest.time_tag}Z`),
  }
}
