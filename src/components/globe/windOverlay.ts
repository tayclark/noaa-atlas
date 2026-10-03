// The imperative half of the wind overlay (#229): two canvas sources on the MapLibre map, a speed
// shading drawn once per field and a particle layer animated with requestAnimationFrame. All the
// maths is in windField.ts; this file only owns the canvases, the loop and the layer visibility.
// It is covered by e2e rather than unit tests, like MapLibreGlobe.tsx.

import type { CanvasSource, Map as MapLibreMap } from 'maplibre-gl'
import { AURORA_RASTER_COORDINATES } from './auroraLayer'
import {
  makeRandom,
  makeWindSampler,
  renderSpeedShading,
  spawnParticle,
  stepSwarm,
  swarmRows,
  type Particle,
  type WindFieldInput,
  type WindSampler,
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
/** Static frames drawn per task, so a redraw yields to the page instead of being one long task (#318). */
const STATIC_FRAMES_PER_TASK = 10

export interface WindOverlay {
  setField: (field: WindFieldInput | null) => void
  setVisible: (visible: boolean) => void
  /** Stops the animation without hiding the layers, for a globe that is out of sight. */
  setPaused: (paused: boolean) => void
  /** Stops the animation and any queued redraw, before the map is removed. */
  dispose: () => void
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
  const rows = swarmRows(swarm, PARTICLE_SIZE)
  let sample: WindSampler | null = null
  let visible = false
  let paused = false
  let frame = 0
  /** The next part of a reduced-motion redraw, which runs over several tasks. */
  let pendingStatic: ReturnType<typeof setTimeout> | undefined

  const segment = (x0: number, y0: number, x1: number, y1: number) => {
    pctx?.moveTo(x0, y0)
    pctx?.lineTo(x1, y1)
  }

  function step(fade: boolean): void {
    if (!pctx || !sample) return
    if (fade) {
      pctx.globalCompositeOperation = 'destination-out'
      pctx.fillStyle = 'rgba(0, 0, 0, 0.07)'
      pctx.fillRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
    }
    pctx.globalCompositeOperation = 'source-over'
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    pctx.lineWidth = 1
    pctx.beginPath()
    stepSwarm(swarm, rows, sample, SECONDS_PER_FRAME, random, PARTICLE_SIZE, segment)
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

  function cancelStatic(): void {
    clearTimeout(pendingStatic)
    pendingStatic = undefined
  }

  function drawStatic(): void {
    cancelStatic()
    pctx?.clearRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
    drawStaticFrom(0)
  }

  // The canvas is only uploaded by pushCanvas, so the map never shows a part-drawn redraw.
  function drawStaticFrom(start: number): void {
    const end = Math.min(STATIC_FRAMES, start + STATIC_FRAMES_PER_TASK)
    for (let i = start; i < end; i++) step(false)
    if (end < STATIC_FRAMES) {
      pendingStatic = setTimeout(() => drawStaticFrom(end), 0)
    } else {
      pendingStatic = undefined
      pushCanvas(map, WIND_PARTICLES_SOURCE_ID)
    }
  }

  return {
    setField(next) {
      sample = next ? makeWindSampler(next) : null
      cancelStatic()
      const ctx = shading.getContext('2d')
      if (!ctx) return
      if (!next) {
        ctx.clearRect(0, 0, SHADING_SIZE, SHADING_SIZE)
      } else {
        const pixels = renderSpeedShading(SHADING_SIZE, SHADING_SIZE, next)
        ctx.putImageData(new ImageData(pixels, SHADING_SIZE, SHADING_SIZE), 0, 0)
      }
      pushCanvas(map, WIND_SHADING_SOURCE_ID)
      if (reducedMotion && visible && next) pendingStatic = setTimeout(drawStatic, 0)
    },
    setVisible(next) {
      visible = next
      const value = next ? 'visible' : 'none'
      map.setLayoutProperty(WIND_SHADING_LAYER_ID, 'visibility', value)
      map.setLayoutProperty(WIND_PARTICLES_LAYER_ID, 'visibility', value)
      if (!next) {
        cancelStatic()
        stopLoop()
        pctx?.clearRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE)
      } else if (reducedMotion) {
        if (sample) drawStatic()
      } else {
        startLoop()
      }
    },
    setPaused(next) {
      paused = next
      if (next) stopLoop()
      else startLoop()
    },
    dispose() {
      cancelStatic()
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
