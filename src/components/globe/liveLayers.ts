// Which globe layer each live service drives (#54). graph.json only says whether a node is live;
// this says what the globe shows for it, so a selection can emphasise the right layer and the
// status card can name it. liveLayers.test.ts keeps it in step with graph.json's liveLayer flags.

export type LiveLayerKey = 'nws-alerts' | 'aurora' | 'kp'

export const LIVE_LAYERS: Readonly<Record<string, { layer: LiveLayerKey; status: string }>> = {
  'nws-api': { layer: 'nws-alerts', status: 'Its live layer, active alerts, is highlighted.' },
  'swpc-ovation-aurora': { layer: 'aurora', status: 'Its live layer, the aurora forecast glow, is highlighted.' },
  'swpc-geomagnetic-indices': { layer: 'kp', status: 'Its live Kp reading is highlighted in the corner.' },
}
