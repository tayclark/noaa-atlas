// Which globe layer each live service drives (#54). graph.json only says whether a node is live;
// this says what the globe shows for it, so a selection can emphasise the right layer and the
// status card can name it. liveLayers.test.ts keeps it in step with graph.json's liveLayer flags.

export type LiveLayerKey = 'nws-alerts' | 'aurora' | 'kp' | 'coops-stations' | 'nowcoast-radar' | 'dart-stations' | 'ndbc-stations' | 'wind' | 'spc-outlook'

export const LIVE_LAYERS: Readonly<Record<string, { layer: LiveLayerKey; status: string }>> = {
  'nws-api': { layer: 'nws-alerts', status: 'Its live layer, active alerts, is highlighted.' },
  'swpc-ovation-aurora': { layer: 'aurora', status: 'Its live layer, the aurora forecast glow, is highlighted.' },
  'swpc-geomagnetic-indices': { layer: 'kp', status: 'Its live Kp reading is highlighted in the corner.' },
  'coops-data-api': { layer: 'coops-stations', status: 'Its live layer, tide stations, is highlighted. Zoom in to see them.' },
  'nowcoast-map-services': { layer: 'nowcoast-radar', status: 'Its live layer, current radar, is drawn on the globe while this is selected.' },
  'ndbc-realtime': { layer: 'ndbc-stations', status: 'Its live layer, the NDBC buoy stations, is drawn on the globe while this is selected.' },
  'gfs-aws-open-data': { layer: 'wind', status: 'Its live layers, the 10 m wind forecast and the wave height forecast (switch between them in the bottom control), are drawn on the globe while this is selected and follow the time slider.' },
  'spc-gis-data': { layer: 'spc-outlook', status: 'Its live layer, the Day 1 convective outlook, is drawn on the globe while this is selected.' },
  'ndbc-dart-realtime': { layer: 'dart-stations', status: 'Its live layer, the DART tsunami buoys, is drawn on the globe while this is selected.' },
}
