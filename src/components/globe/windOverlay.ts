// The imperative half of the wind overlay (#229): two canvas sources on the MapLibre map, a speed
// shading drawn once per field and a particle layer animated with requestAnimationFrame. All the
// maths is in windField.ts; this file only owns the canvases, the loop and the layer visibility.
// It is covered by e2e rather than unit tests, like MapLibreGlobe.tsx.

import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { AURORA_RASTER_COORDINATES } from './auroraLayer'
import {
  advanceParticle,
  latToMercatorRow,
  makeRandom,
  renderSpeedShading,
  sampleBlended,
  spawnParticle,
  type Particle,
  type Wind,
  type WindGrid,
} from './windField'

export const WIND_SHADING_SOURCE_ID = 'wind-shading'
export const WIND_SHADING_LAYER_ID = 'wind-shading-raster'
export const WIND_PARTICLES_SOURCE_ID = 'wind-particles'
export const WIND_PARTICLES_LAYER_ID = 'wind-particles-raster'

export const WIND_ATTRIBUTION =
  'Wind: <a href="https://registry.opendata.aws/noaa-gfs-bdp-pds/">NOAA/NCEP GFS via AWS Open Data</a>'

const SHADING_SIZE = 512
const PARTICLE_SIZE = 1024
const PARTICLE_COUNT = 3500
/** Wind time one frame stands for: about a pixel per frame at 10 m/s. */
const SECONDS_PER_FRAME = 4500
/** Frames drawn at once when motion is reduced, so the field shows as static streaks. */
const STATIC_FRAMES = 40

export interface WindFieldInput {
  a: WindGrid
  b: WindGrid | null
  /** 0 at `a`, 1 at `b`. */
  t: number
}

export interface WindOverlay {
  setField: (field: WindFieldInput | null) => void
  setVisible: (visible: boolean) => void
  /** Stops the animation without hiding the layers, for a globe that is out of sight. */
  setPaused: (paused: boolean) => void
}

export function pushCanvas(map: MapLibreMap, id: string): void {
  // A non-animated canvas source only uploads its texture on load; play() then pause() uploads once.
  const source = map.getSource(id) as CanvasSource | undefined
  source?.play()
  source?.pause()
  map.triggerRepaint()
}

export function createWindOverlay(map: MapLibreMap, reducedMotion: boolean, beforeId?: string): WindOverlay {
  const shading = document.createElement('canvas')
  shading.width = shading.height = SHADING_SIZE
  const particles = document.createElement('canvas')
  particles.width = particles.height = PARTICLE_SIZE
  const pctx = particles.getContext('2d')

  map.addSource(WIND_SHADING_SOURCE_ID, {
    type: 'canvas',
    canvas: shading,
    coordinates: AURORA_RASTER_COORDINATES,
    animate: false,
  })
  map.addSource(WIND_PARTICLES_SOURCE_ID, {
    type: 'canvas',
    canvas: particles,
    coordinates: AURORA_RASTER_COORDINATES,
    animate: false,
  })
  const paint = { 'raster-resampling': 'linear' as const, 'raster-fade-duration': 0 }
  map.addLayer(
    { id: WIND_SHADING_LAYER_ID, type: 'raster', source: WIND_SHADING_SOURCE_ID, layout: { visibility: 'none' }, paint: { ...paint, 'raster-opacity': 0.8 } },
    beforeId,
  )
  map.addLayer(
    { id: WIND_PARTICLES_LAYER_ID, type: 'raster', source: WIND_PARTICLES_SOURCE_ID, layout: { visibility: 'none' }, paint: { ...paint, 'raster-opacity': 0.9 } },
    beforeId,
  )

  const random = makeRandom(229)
  const swarm: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(random))
  let field: WindFieldInput | null = null
  let visible = false
  let paused = false
  let frame = 0

  const windAt = (lat: number, lon: number): Wind =>
    field ? sampleBlended(field.a, field.b, field.t, lat, lon) : { u: 0, v: 0 }
  const px = (lon: number) => ((lon + 180) / 360) * PARTICLE_SIZE
  const py = (lat: number) => latToMercatorRow(lat) * PARTICLE_SIZE

  function step(fade: boolean): void {
    if (!pctx || !field) return
    if (fade) {
      pctx.globalCompositeOperation = 'destination-out'
      pctx.fillStyle = 'rgba(0, 0, 0, 0.07)'
      pctx.fillRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
    }
    pctx.globalCompositeOperation = 'source-over'
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    pctx.lineWidth = 1
    pctx.beginPath()
    for (const p of swarm) {
      const x0 = px(p.lon)
      const y0 = py(p.lat)
      const moved = advanceParticle(p, windAt(p.lat, p.lon), SECONDS_PER_FRAME, random)
      const x1 = px(p.lon)
      // Skip the segment of a particle that respawned or wrapped across the antimeridian.
      if (!moved || Math.abs(x1 - x0) > PARTICLE_SIZE / 2) continue
      pctx.moveTo(x0, y0)
      pctx.lineTo(x1, py(p.lat))
    }
    pctx.stroke()
  }

  function loop(): void {
    frame = 0
    if (!visible || paused || reducedMotion) return
    step(true)
    frame = requestAnimationFrame(loop)
  }

  function startLoop(): void {
    if (frame || !visible || paused || reducedMotion) return
    ;(map.getSource(WIND_PARTICLES_SOURCE_ID) as CanvasSource | undefined)?.play()
    frame = requestAnimationFrame(loop)
  }

  function stopLoop(): void {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    ;(map.getSource(WIND_PARTICLES_SOURCE_ID) as CanvasSource | undefined)?.pause()
  }

  function drawStatic(): void {
    pctx?.clearRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
    for (let i = 0; i < STATIC_FRAMES; i++) step(false)
    pushCanvas(map, WIND_PARTICLES_SOURCE_ID)
  }

  return {
    setField(next) {
      field = next
      const ctx = shading.getContext('2d')
      if (!ctx) return
      if (!next) {
        ctx.clearRect(0, 0, SHADING_SIZE, SHADING_SIZE)
      } else {
        const pixels = renderSpeedShading(SHADING_SIZE, SHADING_SIZE, windAt)
        ctx.putImageData(new ImageData(pixels, SHADING_SIZE, SHADING_SIZE), 0, 0)
      }
      pushCanvas(map, WIND_SHADING_SOURCE_ID)
      if (reducedMotion && visible && next) drawStatic()
    },
    setVisible(next) {
      visible = next
      const value = next ? 'visible' : 'none'
      map.setLayoutProperty(WIND_SHADING_LAYER_ID, 'visibility', value)
      map.setLayoutProperty(WIND_PARTICLES_LAYER_ID, 'visibility', value)
      if (!next) {
        stopLoop()
        pctx?.clearRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
      } else if (reducedMotion) {
        if (field) drawStatic()
      } else {
        startLoop()
      }
    },
    setPaused(next) {
      paused = next
      if (next) stopLoop()
      else startLoop()
    },
  }
}
