// Which globe layer each live service drives (#54). graph.json only says whether a node is live;
// this says what the globe shows for it, so a selection can emphasise the right layer and the
// status card can name it. liveLayers.test.ts keeps it in step with graph.json's liveLayer flags.

export type LiveLayerKey = 'nhc-tracks' | 'nws-alerts' | 'aurora' | 'kp' | 'coops-stations' | 'nowcoast-radar' | 'dart-stations' | 'ndbc-stations' | 'wind' | 'spc-outlook' | 'arcgis-raster' | 'arcgis-vector' | 'arcgis-charts' | 'arcgis-habitat'

// `layer` is null for a node that is live only as a try-it in its detail panel (#240): nothing is drawn.
export const LIVE_LAYERS: Readonly<Record<string, { layer: LiveLayerKey | null; status: string }>> = {
  'nws-api': { layer: 'nws-alerts', status: 'Its live layer, active alerts, is highlighted.' },
  'swpc-ovation-aurora': { layer: 'aurora', status: 'Its live layer, the aurora forecast glow, is highlighted.' },
  'swpc-geomagnetic-indices': { layer: 'kp', status: 'Its live Kp reading is highlighted in the corner.' },
  'coops-data-api': { layer: 'coops-stations', status: 'Its live layer, tide stations, is highlighted. Zoom in to see them.' },
  'nowcoast-map-services': { layer: 'nowcoast-radar', status: 'Its live layer, current radar, is drawn on the globe while this is selected.' },
  'ndbc-realtime': { layer: 'ndbc-stations', status: 'Its live layer, the NDBC buoy stations, is drawn on the globe while this is selected.' },
  'gfs-aws-open-data': { layer: 'wind', status: 'Its live layers, the 10 m wind forecast and the wave height forecast (switch between them in the bottom control), are drawn on the globe while this is selected and follow the time slider.' },
  'spc-gis-data': { layer: 'spc-outlook', status: 'Its live layer, the Day 1 convective outlook, is drawn on the globe while this is selected.' },
  'nws-raster-map-services': { layer: 'arcgis-raster', status: 'Its live layer, the last 24 hours of observed precipitation, is drawn on the globe while this is selected.' },
  'nws-gis-portal': { layer: 'arcgis-vector', status: 'Its live layer, the CPC 6-10 day temperature outlook, is drawn on the globe while this is selected.' },
  'noaa-chart-services': { layer: 'arcgis-charts', status: 'Its live layer, the NOAA electronic navigational charts (ENC), is drawn on the globe while this is selected. Zoom in to a coast to see them. These charts are not for navigation.' },
  'nmfs-arcgis-services': { layer: 'arcgis-habitat', status: 'Its live layer, ESA critical habitat for NMFS-listed species (areas plus stream and beach lines), is drawn on the globe while this is selected. Zoom in to a coast or river. Indicative only: official boundaries are in 50 CFR 226.' },
  'nhc-active-storms': { layer: 'nhc-tracks', status: 'Its live layer, the tracks and forecast cones of active tropical cyclones, is drawn on the globe while this is selected. Look up a place in a storm\'s path (tap it or use My location) to be offered the storm\'s full track, with satellite imagery and a forecast you can play.' },
  'ndbc-dart-realtime': { layer: 'dart-stations', status: 'Its live layer, the DART tsunami buoys, is drawn on the globe while this is selected.' },
  'swpc-alerts-scales': { layer: null, status: 'Live in its detail panel: Run sample fetches the current scales and alerts. Nothing is drawn on the globe.' },
  'swpc-rtsw-solar-wind': { layer: null, status: 'Live in its detail panel: Run sample fetches the latest solar wind readings. Nothing is drawn on the globe.' },
  'swpc-goes-space-environment': { layer: null, status: 'Live in its detail panel: Run sample fetches the latest X-ray flux. Nothing is drawn on the globe.' },
  'coops-metadata-api': { layer: null, status: 'Live in its detail panel: Run sample fetches the details, flood levels and datums of one station (Panama City, FL). Nothing is drawn on the globe.' },
  'coops-derived-product-api': { layer: null, status: 'Live in its detail panel: Run sample fetches the sea level trend and high tide flood days of one station (Panama City, FL). Nothing is drawn on the globe.' },
}
