import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  US_CENTER,
  US_ZOOM,
} from './globeConfig'

// Live NWS alerts, click-for-details, and fly-to are out of scope for #36 —
// see spike/globe-maplibre (from the #82 engine spike) for a working
// reference when those land as their own M4 issues.
export function MapLibreGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: US_CENTER,
      zoom: US_ZOOM,
    })

    // setProjection must run after the style has finished loading, or
    // MapLibre throws "Style is not done loading."
    map.on('load', () => {
      map.setProjection(GLOBE_PROJECTION)
    })

    return () => map.remove()
  }, [])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Globe view of NOAA API coverage"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
