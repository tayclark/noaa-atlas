// What the globe pane says when the map can't run (#260). The rest of the app needs no WebGL, so
// each message says it still works.

const REST_STILL_WORKS = 'The graph, finder, Compare and Inspector still work.'

// What each browser says when a dynamic `import()` can't fetch its module (Chromium, Firefox, Safari).
const CHUNK_LOAD_FAILED = /dynamically imported module|Importing a module script failed/i

/** The message for an error thrown while the map starts, such as MapLibre's missing-WebGL2 error. */
export function describeMapInitError(error: unknown): string {
  // Matched by name rather than `instanceof`, so this module doesn't pull in MapLibre.
  if (error instanceof Error && error.name === 'GPUInitializationError') {
    return `The map needs WebGL2, which this browser has turned off or doesn't support. ${REST_STILL_WORKS}`
  }
  // The lazy globe chunk didn't arrive (#264): offline, or a deploy replaced it since the page loaded.
  if (error instanceof Error && CHUNK_LOAD_FAILED.test(error.message)) {
    return `The globe's code couldn't load. Check the connection and reload to try again. ${REST_STILL_WORKS}`
  }
  return `The map couldn't start in this browser. ${REST_STILL_WORKS}`
}

/** The message for a map `error` event before the basemap style has loaded. */
export function describeStyleError(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
  const detail = typeof status === 'number' && status > 0 ? ` (HTTP ${status})` : ''
  return `The basemap couldn't load${detail}, so the globe and its live layers aren't shown. Reload to try again. ${REST_STILL_WORKS}`
}
