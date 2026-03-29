import {
  GlobeEngine,
  TerrainTileLayer,
  RasterTileSource,
  RasterLayer,
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
 * Standard OSM XYZ raster tiles.
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
    showInteractionAnchor: true,
    mirrorDisplayX: true,
  });

  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 14,
      tileSize: 256,
      cache: 128,
      extraBounds: [] // Disable DEM outside configured bounds (Gaode imagery only).
    },
    meshSegments: 16,
    concurrency: 6,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });
  const imagerySource = new RasterTileSource("gaode-satellite", {
    tiles: [GAODE_URLS.satellite],
    tileSize: 256,
    cache: 128,
    maxZoom: 18,
    minZoom: 3,
    concurrency: 6
  });
  engine.addSource("gaode-satellite", imagerySource);
  const imageryLayer = new RasterLayer({ id: "gaode-satellite", source: "gaode-satellite", zIndex: 100 });

  engine.addLayer(terrain);
  engine.addLayer(imageryLayer);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 }); // center of China

  terrain.ready().then(
    () => { if (output) output.textContent = "Gaode satellite tiles loaded"; },
    () => { if (output) output.textContent = "Gaode satellite tiles failed – check network"; },
  );

  if (output) output.textContent = "正在加载高德卫星...";

  return engine;
}

/* ------------------------------------------------------------------ */
/*  Gaode satellite + labels example                                    */
/* ------------------------------------------------------------------ */

/**
 * Launch a globe using Gaode satellite imagery with road/label overlay.
 * Two RasterLayer overlays: satellite base + transparent label overlay.
 */
export function runGaodeSatelliteLabels(container: HTMLElement, output?: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
    showInteractionAnchor: true,
    mirrorDisplayX: true,
  });

  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 18,
      tileSize: 256,
      cache: 128,
      extraBounds: []
    },
    meshSegments: 16,
    concurrency: 6,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });

  const satelliteSource = new RasterTileSource("gaode-satellite-base", {
    tiles: [GAODE_URLS.satellite],
    tileSize: 256,
    cache: 128,
    concurrency: 6
  });
  const labelSource = new RasterTileSource("gaode-satellite-labels", {
    tiles: [GAODE_URLS.labels],
    tileSize: 256,
    cache: 128,
    concurrency: 4
  });
  engine.addSource("gaode-satellite-base", satelliteSource);
  engine.addSource("gaode-satellite-labels", labelSource);
  const satelliteLayer = new RasterLayer({ id: "gaode-satellite-base", source: "gaode-satellite-base" });
  const labelLayer = new RasterLayer({ id: "gaode-satellite-labels", source: "gaode-satellite-labels" });

  engine.addLayer(terrain);
  engine.addLayer(satelliteLayer);
  engine.addLayer(labelLayer);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  Promise.allSettled([terrain.ready()]).then(() => {
    if (output) output.textContent = "Gaode satellite + labels loaded";
  });

  if (output) output.textContent = "正在加载高德卫星 + 标注...";

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
    showInteractionAnchor: true,
    mirrorDisplayX: true,
  });

  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 18,
      tileSize: 256,
      cache: 128,
      extraBounds: []
    },
    meshSegments: 16,
    concurrency: 6,
    coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
    skirtDepthMeters: 500,
  });
  const imagerySource = new RasterTileSource("gaode-road", {
    tiles: [GAODE_URLS.road],
    tileSize: 256,
    cache: 128,
    concurrency: 6
  });
  engine.addSource("gaode-road", imagerySource);
  const imageryLayer = new RasterLayer({ id: "gaode-road", source: "gaode-road" });

  engine.addLayer(terrain);
  engine.addLayer(imageryLayer);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  terrain.ready().then(
    () => { if (output) output.textContent = "Gaode road map loaded"; },
    () => { if (output) output.textContent = "Gaode road map failed – check network"; },
  );

  if (output) output.textContent = "正在加载高德道路底图...";

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

  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 18,
      tileSize: 256,
      cache: 128,
      extraBounds: []
    },
    meshSegments: 16,
    concurrency: 6,
    coordTransform: (lng, lat) => wgs84ToBd09({ lng, lat }),
    skirtDepthMeters: 500,
  });
  const imagerySource = new RasterTileSource("baidu-satellite", {
    tiles: [BAIDU_URLS.satellite],
    tileSize: 256,
    cache: 128,
    concurrency: 6
  });
  engine.addSource("baidu-satellite", imagerySource);
  const imageryLayer = new RasterLayer({ id: "baidu-satellite", source: "baidu-satellite" });

  engine.addLayer(terrain);
  engine.addLayer(imageryLayer);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  terrain.ready().then(
    () => { if (output) output.textContent = "Baidu satellite tiles loaded"; },
    () => { if (output) output.textContent = "Baidu satellite tiles failed – check network"; },
  );

  if (output) output.textContent = "正在加载百度卫星...";

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

  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 18,
      tileSize: 256,
      cache: 128,
      extraBounds: []
    },
    meshSegments: 16,
    concurrency: 6,
    coordTransform: (lng, lat) => wgs84ToBd09({ lng, lat }),
    skirtDepthMeters: 500,
  });
  const imagerySource = new RasterTileSource("baidu-road", {
    tiles: [BAIDU_URLS.road],
    tileSize: 256,
    cache: 128,
    concurrency: 6
  });
  engine.addSource("baidu-road", imagerySource);
  const imageryLayer = new RasterLayer({ id: "baidu-road", source: "baidu-road" });

  engine.addLayer(terrain);
  engine.addLayer(imageryLayer);
  engine.setView({ lng: 104.07, lat: 35.44, altitude: 2.8 });

  terrain.ready().then(
    () => { if (output) output.textContent = "Baidu road map loaded"; },
    () => { if (output) output.textContent = "Baidu road map failed – check network"; },
  );

  if (output) output.textContent = "正在加载百度道路底图...";

  return engine;
}
