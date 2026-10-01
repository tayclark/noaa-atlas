import type { GribField } from '../../data/grib2'
import { getLatestCycle, getWaveField } from '../../data/gfsClient'
import { useGfsForecast, type GfsForecast, type GfsSource } from './useGfsForecast'

export type WaveForecast = GfsForecast<GribField>

const WAVE_SOURCE: GfsSource<GribField> = {
  getCycle: () => getLatestCycle(Date.now(), 'wave'),
  getField: getWaveField,
  errorMessage: 'The GFS-Wave forecast could not be loaded.',
}

/** The significant wave height field for the shared time (#229); see `useGfsForecast`. */
export function useWaveForecast(shown: boolean, time: number | null): WaveForecast {
  return useGfsForecast(WAVE_SOURCE, shown, time)
}
