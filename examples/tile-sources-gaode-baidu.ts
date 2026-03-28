import {
  GlobeEngine,
  SurfaceTileLayer,
  wgs84ToGcj02,
  wgs84ToBd09,
} from "../src";

/**
 * Gaode (Amap) tile source URLs.
 *
 * - Road:     style=8 (standard map with Chinese labels)
 * - Satellite: style=6 (satellite imagery only)
 * - Labels:   style=8 on satellite base (road/label overlay)
 *
 * NOTE: Gaode tiles use GCJ-02 Mercator projection.
 * There will be a ~100–500m offset from WGS-84 coordinates within China.
 * Use `gcj02ToWgs84` from `../src` if precise WGS-84 alignment is needed.
 */
export const GAODE_URLS = {
  road:
    "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
  satellite:
    "https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
  labels:
    "https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}",
} as const;

/**
 * Baidu tile source URLs.
 *
 * - Satellite: type=sate
 * - Road:      styles=pl (standard map)
 * - Labels:    styles=sl (label overlay on satellite)
 *
 * NOTE: Baidu uses a custom projection (BD-09 Mercator) and tile numbering
 * system that differs from standard Web Mercator XYZ. Tiles will render
 * with alignment issues outside of China. For production use within China,
 * a coordinate conversion layer is recommended.
 */
export const BAIDU_URLS = {
  satellite:
    "https://shangetu0.map.bdimg.com/it/u=x={x};y={y};z={z};v=009;type=sate&fm=46",
  road:
    "https://online0.map.bdimg.com/onlinelabel/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1&p=1",
  labels:
    "https://online0.map.bdimg.com/onlinelabel/?qt=tile&x={x}&y={y}&z={z}&styles=sl&scaler=1&p=1",
} as const;

/**
 * Standard OSM tile source (default in SurfaceTileLayer).
 */
export const OSM_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png" as const;

/* ------------------------------------------------------------------ */
/*  Gaode satellite example                                             */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Gaode satellite imagery.
 *
 * @param container - DOM element to mount the renderer into
 * @param output    - optional DOM element for status messages
 */
export function runGaodeSatellite(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });

  const surfaceTiles = new SurfaceTileLayer("gaode-satellite", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 6,
    imageryTemplateUrl: GAODE_URLS.satellite,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 }); // center of China

  surfaceTiles.ready().then(
    () => { if (output) output.textContent = "Gaode satellite tiles loaded"; },
    () => { if (output) output.textContent = "Gaode satellite tiles failed – check network"; },
  );

  if (output) output.textContent = "Loading Gaode satellite...";

  return engine;
}

/* ------------------------------------------------------------------ */
/*  Gaode satellite + labels example                                    */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Gaode satellite imagery with road/label overlay.
 * Two SurfaceTileLayer instances: satellite base + transparent label overlay.
 */
export function runGaodeSatelliteLabels(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });

  const satelliteBase = new SurfaceTileLayer("gaode-satellite-base", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 6,
    imageryTemplateUrl: GAODE_URLS.satellite,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });

  const labelOverlay = new SurfaceTileLayer("gaode-satellite-labels", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 4,
    imageryTemplateUrl: GAODE_URLS.labels,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });

  engine.addLayer(satelliteBase);
  engine.addLayer(labelOverlay);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  Promise.allSettled([satelliteBase.ready(), labelOverlay.ready()]).then(() => {
    if (output) output.textContent = "Gaode satellite + labels loaded";
  });

  if (output) output.textContent = "Loading Gaode satellite + labels...";

  return engine;
}

/* ------------------------------------------------------------------ */
/*  Gaode road map example                                              */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Gaode road map (standard map with Chinese labels).
 */
export function runGaodeRoad(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#f0ede8",
  });

  const surfaceTiles = new SurfaceTileLayer("gaode-road", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 6,
    imageryTemplateUrl: GAODE_URLS.road,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  surfaceTiles.ready().then(
    () => { if (output) output.textContent = "Gaode road map loaded"; },
    () => { if (output) output.textContent = "Gaode road map failed – check network"; },
  );

  if (output) output.textContent = "Loading Gaode road map...";

  return engine;
}

/* ------------------------------------------------------------------ */
/*  Baidu satellite example                                             */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Baidu satellite imagery.
 *
 * NOTE: Baidu uses a custom tile projection. Tiles will have alignment
 * offsets in regions far from China. For best results, use within China.
 */
export function runBaiduSatellite(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });

  const surfaceTiles = new SurfaceTileLayer("baidu-satellite", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 6,
    imageryTemplateUrl: BAIDU_URLS.satellite,
    coordTransform: (lng, lat) => wgs84ToBd09({ lng, lat }),
    skirtDepthMeters: 500,
  });

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  surfaceTiles.ready().then(
    () => { if (output) output.textContent = "Baidu satellite tiles loaded"; },
    () => { if (output) output.textContent = "Baidu satellite tiles failed – check network"; },
  );

  if (output) output.textContent = "Loading Baidu satellite...";

  return engine;
}

/* ------------------------------------------------------------------ */
/*  Baidu road map example                                              */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Baidu road map.
 */
export function runBaiduRoad(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#f0ede8",
  });

  const surfaceTiles = new SurfaceTileLayer("baidu-road", {
    minZoom: 3,
    maxZoom: 18,
    tileSize: 256,
    meshSegments: 16,
    cacheSize: 128,
    concurrency: 6,
    imageryTemplateUrl: BAIDU_URLS.road,
    coordTransform: (lng, lat) => wgs84ToBd09({ lng, lat }),
    skirtDepthMeters: 500,
  });

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  surfaceTiles.ready().then(
    () => { if (output) output.textContent = "Baidu road map loaded"; },
    () => { if (output) output.textContent = "Baidu road map failed – check network"; },
  );

  if (output) output.textContent = "Loading Baidu road map...";

  return engine;
}
