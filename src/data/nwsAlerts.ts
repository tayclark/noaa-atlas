// Spike-only (#82): throwaway fetch helper, not part of the app's real data layer.
// Note: browsers ignore a custom User-Agent set via fetch(), so NWS's recommended
// identification header can't be sent from the client. The endpoint still works
// without it for this spike's purposes.

export type AlertGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export interface NwsAlertFeature {
  type: 'Feature'
  properties: {
    headline: string | null
    event: string
    severity: string
  }
  geometry: AlertGeometry | null
}

export interface NwsAlertCollection {
  type: 'FeatureCollection'
  features: NwsAlertFeature[]
}

export async function fetchActiveAlerts(): Promise<NwsAlertCollection> {
  const res = await fetch('https://api.weather.gov/alerts/active')
  if (!res.ok) {
    throw new Error(`NWS alerts request failed: ${res.status}`)
  }
  const data = (await res.json()) as NwsAlertCollection
  return {
    ...data,
    features: data.features.filter((f) => f.geometry !== null),
  }
}
