import { getLatestCycle, getWindField, type WindField } from '../../data/gfsClient'
import { useGfsForecast, type GfsForecast, type GfsSource } from './useGfsForecast'

export type WindForecast = GfsForecast<WindField>

const WIND_SOURCE: GfsSource<WindField> = {
  getCycle: () => getLatestCycle(),
  getField: getWindField,
  errorMessage: 'The GFS wind forecast could not be loaded.',
}

/** The 10 m wind field for the shared time (#229); see `useGfsForecast`. */
export function useWindForecast(shown: boolean, time: number | null): WindForecast {
  return useGfsForecast(WIND_SOURCE, shown, time)
}
