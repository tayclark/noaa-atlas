// The globe's "locate me" button: position options and error wording, kept out of
// MapLibreGlobe.tsx so they're unit-testable.

/**
 * Asks for the most precise fix the device can give (GPS where available), and never reuses a
 * cached position. The timeout is longer than MapLibre's 6s default because a high-accuracy fix
 * can take a while to arrive.
 */
export const GEOLOCATE_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
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
      return 'Location access is blocked. Allow it for this site in your browser settings to use this button.'
    case POSITION_UNAVAILABLE:
      return 'Your location is not available right now.'
    case TIMEOUT:
      return 'Finding your location took too long. Try again.'
    default:
      return 'Could not find your location.'
  }
}
