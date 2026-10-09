import type { GribField } from '../../data/grib2'
import { getLatestCycle, getReflectivityField } from '../../data/gfsClient'
import { useGfsForecast, type GfsForecast, type GfsSource } from './useGfsForecast'

export type ReflectivityForecast = GfsForecast<GribField>

const REFLECTIVITY_SOURCE: GfsSource<GribField> = {
  getCycle: () => getLatestCycle(Date.now(), 'atmos'),
  getField: getReflectivityField,
  errorMessage: 'The GFS simulated radar could not be loaded.',
}

/**
 * The GFS composite reflectivity for a hurricane's forecast (#340); see `useGfsForecast`. Pass the
 * start of a 3-hour step (`reflectivityStep`) rather than the slider time, so a playing storm asks for
 * a new pair of files once per step instead of every frame, and blend within the step when drawing.
 */
export function useReflectivityForecast(shown: boolean, step: number | null): ReflectivityForecast {
  return useGfsForecast(REFLECTIVITY_SOURCE, shown, step)
}
