// Pure helpers for the NWS active-alerts layer (#38). Kept out of MapLibreGlobe.tsx so the
// severity styling and geometry/zone-only split are unit-testable — MapLibreGlobe.tsx itself
// is excluded from coverage and verified manually in the browser (see vite.config.ts).

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import { NwsHttpError, NwsParseError } from '../../data/nwsClient'
import type { NwsAlertCollection } from '../../data/nwsSchema'

// Matches the --color-alert-danger/--color-alert-warning tokens in index.css (this module is
// plain TS, not a component, so it can't read CSS custom properties directly).
export const ALERT_SEVERITY_COLORS: Record<string, string> = {
  Extreme: '#f31260',
  Severe: '#f5a524',
  Moderate: '#e6c229',
  Minor: '#5c9dd6',
  Unknown: '#7f8ea3',
}

const DEFAULT_ALERT_COLOR = ALERT_SEVERITY_COLORS.Unknown

/** MapLibre `match` expression mapping alert severity to fill/line color. */
export function alertSeverityColorExpression(): ExpressionSpecification {
  const expression: unknown[] = ['match', ['get', 'severity']]
  for (const [severity, color] of Object.entries(ALERT_SEVERITY_COLORS)) {
    expression.push(severity, color)
  }
  expression.push(DEFAULT_ALERT_COLOR)
  return expression as ExpressionSpecification
}

export interface SplitAlerts {
  /** Alerts with polygon/multipolygon geometry, ready to render as a GeoJSON source. */
  mappable: NwsAlertCollection
  /** Zone-only alerts (null geometry) that can't be placed on the map but must still surface. */
  zoneOnly: NwsAlertCollection['features']
}

/**
 * NWS alerts for zones without an on-file polygon come back with `geometry: null`. Those are
 * a valid response, not an error (see nwsSchema.ts), so they're separated here rather than
 * dropped, and the caller is expected to surface them elsewhere in the UI (see #38 AC).
 */
export function splitAlertsByGeometry(collection: NwsAlertCollection): SplitAlerts {
  const mappableFeatures = collection.features.filter((f) => f.geometry !== null)
  const zoneOnly = collection.features.filter((f) => f.geometry === null)
  return {
    mappable: { type: 'FeatureCollection', features: mappableFeatures },
    zoneOnly,
  }
}

export interface AlertPopupContent {
  event: string
  areaDesc: string
  effective: string
  expires: string
}

/** Formats an alert's properties for the click popup: event, area and times (#38 AC). */
export function describeAlertForPopup(
  properties: NwsAlertCollection['features'][number]['properties'],
): AlertPopupContent {
  return {
    event: properties.event,
    areaDesc: properties.areaDesc,
    effective: new Date(properties.effective).toLocaleString(),
    expires: new Date(properties.expires).toLocaleString(),
  }
}

/** Builds a human-readable message for a failed alerts fetch, based on the error kind (#42 AC). */
export function describeAlertsFetchOutcome(err: unknown): string {
  if (err instanceof NwsHttpError) {
    if (err.kind === 'rate-limited') return 'NWS rate limit exceeded — alerts unavailable, try again shortly.'
    if (err.kind === 'server-error') return 'NWS service is unavailable — alerts could not be loaded.'
    return 'Could not load NWS alerts right now.'
  }
  if (err instanceof NwsParseError) return 'NWS returned an unexpected alerts response.'
  return 'Something went wrong loading alerts.'
}
