// The globe's "locate me" button: position options and error wording, kept out of
// MapLibreGlobe.tsx so they're unit-testable.

/**
 * Asks for a quick fix, and takes one from the last five minutes. The answer is a forecast on the
 * NWS's 2.5 km grid and coverage that is regional, so a GPS fix (seconds of waiting and a battery
 * cost on a phone) buys nothing a network position doesn't.
 */
export const GEOLOCATE_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
}

/** Zoom cap when flying to the user's position, so a very precise fix doesn't land at street level. */
export const GEOLOCATE_MAX_ZOOM = 11

// GeolocationPositionError codes (https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError/code).
const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

/** A user-facing message for a failed location request. */
export function describeGeolocationError(code: number): string {
  switch (code) {
    case PERMISSION_DENIED:
      return 'Location access is blocked. Allow it for this site in your browser settings, or tap the map to look up a place.'
    case POSITION_UNAVAILABLE:
      return 'Your location is not available right now.'
    case TIMEOUT:
      return 'Finding your location took too long. Try again.'
    default:
      return 'Could not find your location.'
  }
}
