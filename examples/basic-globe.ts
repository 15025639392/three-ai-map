import { CanvasTexture } from "three";
import {
  GlobeEngine,
  ElevationLayer,
  ImageryLayer,
  SurfaceTileLayer,
  AnimationManager,
  PerformanceMonitor,
  haversineDistance
} from "../src";

/* ------------------------------------------------------------------ */
/*  Procedural fallback texture                                        */
/* ------------------------------------------------------------------ */

function createProceduralEarthTexture(size = 2048): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;

  // ocean gradient
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#0e203f");
  ocean.addColorStop(0.45, "#163a6f");
  ocean.addColorStop(1, "#08142b");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid lines
  ctx.strokeStyle = "rgba(195, 223, 255, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += canvas.width / 12) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += canvas.height / 6) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // continents (stylised blobs)
  ctx.fillStyle = "#4e8b5a";
  const shapes = [
    [[.12,.18],[.21,.12],[.28,.16],[.26,.28],[.19,.36],[.13,.30]],
    [[.30,.48],[.34,.36],[.41,.34],[.44,.52],[.37,.72],[.31,.64]],
    [[.48,.16],[.60,.12],[.72,.18],[.83,.22],[.79,.34],[.68,.31],[.57,.28],[.50,.24]],
    [[.62,.44],[.69,.42],[.75,.48],[.72,.59],[.64,.57]],
    [[.82,.68],[.88,.66],[.90,.74],[.84,.77]],
  ];
  for (const shape of shapes) {
    ctx.beginPath();
    shape.forEach(([u, v], i) => {
      const x = u * canvas.width, y = v * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill();
  }

  // ice caps
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath(); ctx.ellipse(canvas.width*.28, canvas.height*.18, 180, 80, .2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(canvas.width*.72, canvas.height*.22, 220, 90, -.1, 0, Math.PI*2); ctx.fill();

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Data sets                                                          */
/* ------------------------------------------------------------------ */

const CITIES = [
  { name: "Shanghai",     lng: 121.47,  lat: 31.23,  color: "#ffd166" },
  { name: "Tokyo",        lng: 139.69,  lat: 35.69,  color: "#ff8f70" },
  { name: "New York",     lng: -74.00,  lat: 40.71,  color: "#6ad8ff" },
  { name: "London",       lng:  -0.12,  lat: 51.51,  color: "#c084fc" },
  { name: "Sydney",       lng: 151.21,  lat:-33.87,  color: "#36d695" },
  { name: "São Paulo",    lng: -46.63,  lat:-23.55,  color: "#fb923c" },
  { name: "Dubai",        lng:  55.27,  lat: 25.20,  color: "#f472b6" },
  { name: "Cape Town",    lng:  18.42,  lat:-33.92,  color: "#38bdf8" },
];

const ROUTES = [
  { from: "Shanghai",  to: "New York",  color: "#8ed6ff" },
  { from: "London",    to: "Tokyo",     color: "#c084fc" },
  { from: "Dubai",     to: "Sydney",    color: "#f472b6" },
  { from: "São Paulo", to: "Cape Town", color: "#fb923c" },
];

const REGIONS = [
  {
    id: "east-asia",
    label: "East Asia",
    coords: [{ lng:100, lat:5 },{ lng:145, lat:5 },{ lng:145, lat:45 },{ lng:100, lat:45 }],
    fillColor: "#36d695", opacity: 0.3,
  },
  {
    id: "europe",
    label: "Europe",
    coords: [{ lng:-10, lat:35 },{ lng:40, lat:35 },{ lng:40, lat:60 },{ lng:-10, lat:60 }],
    fillColor: "#c084fc", opacity: 0.3,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cityByName(name: string) {
  return CITIES.find(c => c.name === name)!;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Generate arc waypoints between two points on the globe surface. */
function buildArcRoute(from: typeof CITIES[0], to: typeof CITIES[0], segments = 64) {
  const alt = 0.04 + haversineDistance(
    { lng: from.lng, lat: from.lat },
    { lng: to.lng, lat: to.lat }
  ) / 20000; // altitude proportional to distance
  const pts: Array<{ lng: number; lat: number; altitude: number }> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push({
      lng: lerp(from.lng, to.lng, t),
      lat: lerp(from.lat, to.lat, t),
      altitude: alt * Math.sin(t * Math.PI), // arc
    });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  Demo bootstrap                                                     */
/* ------------------------------------------------------------------ */

export function runBasicGlobe(container: HTMLElement, output: HTMLElement): GlobeEngine {
  const perfMonitor = new PerformanceMonitor();
  const animManager  = new AnimationManager();

  /* ---- engine ---- */
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });

  /* ---- tile layers ---- */
  const baseElevation = new ElevationLayer("elevation-tiles",  { zoom: 3, tileSize: 256, cacheSize: 24, concurrency: 4, exaggeration: 1 });
  const surfaceTiles  = new SurfaceTileLayer("surface-tiles",   { minZoom: 3, maxZoom: 11, tileSize: 128, meshSegments: 16, cacheSize: 96, concurrency: 6, elevationExaggeration: 1, zoomExaggerationBoost: 6, textureUvInsetPixels: 1, skirtDepthMeters: 1400 });

  engine.addLayer(baseElevation);
  engine.addLayer(surfaceTiles);

  baseElevation.ready().catch(() => {
    output.textContent = "Elevation tiles use fallback";
  });
  surfaceTiles.ready().catch(() => {
    output.textContent = "Surface tiles use fallback";
  });

  /* ---- markers ---- */
  for (const city of CITIES) {
    engine.addMarker({
      id: city.name.toLowerCase().replace(/\s+/g, "-"),
      lng: city.lng,
      lat: city.lat,
      altitude: 0.02,
      color: city.color,
    });
  }

  /* ---- polylines (flight arcs) ---- */
  for (const route of ROUTES) {
    const pts = buildArcRoute(cityByName(route.from), cityByName(route.to));
    engine.addPolyline({ id: `route-${route.from}-${route.to}`, coordinates: pts, color: route.color });
  }

  /* ---- polygons (regions) ---- */
  for (const region of REGIONS) {
    engine.addPolygon({
      id: region.id,
      coordinates: region.coords.map(c => ({ lng: c.lng, lat: c.lat, altitude: 0.01 })),
      fillColor: region.fillColor,
      opacity: region.opacity,
    });
  }

  /* ---- animated camera tour ---- */
  const TOUR_STEPS = [
    { lng: 110, lat: 28,  alt: 2.4 },
    { lng: 139, lat: 35,  alt: 1.8 },
    { lng: -74, lat: 40,  alt: 2.0 },
    { lng:  -0, lat: 51,  alt: 1.6 },
    { lng: 151, lat:-33,  alt: 2.2 },
    { lng:  55, lat: 25,  alt: 1.8 },
    { lng: 110, lat: 28,  alt: 2.4 },
  ];

  let tourStep = 0;
  function flyToNext() {
    const from = engine.getView();
    const to   = TOUR_STEPS[(tourStep + 1) % TOUR_STEPS.length];
    tourStep = (tourStep + 1) % TOUR_STEPS.length;

    animManager.startAnimation({
      duration: 3000,
      easing: AnimationManager.easeInOutCubic,
      onUpdate: (t) => {
        engine.setView({
          lng: lerp(from.lng, to.lng, t),
          lat: lerp(from.lat, to.lat, t),
          altitude: lerp(from.altitude, to.alt, t),
        });
      },
    });
  }

  // Start touring after a short delay
  const tourTimer = setTimeout(() => {
    flyToNext();
    const tourInterval = setInterval(() => {
      flyToNext();
    }, 5000);
    // expose for cleanup
    (window as any).__tourInterval = tourInterval;
  }, 2000);
  (window as any).__tourTimer = tourTimer;

  /* ---- initial view ---- */
  engine.setView({ lng: 110, lat: 28, altitude: 2.4 });

  /* ---- click handler ---- */
  engine.on("click", ({ pickResult: result }) => {
    if (!result) { output.textContent = "Nothing picked"; return; }
    if (result.type === "marker")  { output.textContent = `marker: ${result.marker.id}`; return; }
    if (result.type === "polyline") { output.textContent = `polyline: ${result.polyline.id}`; return; }
    if (result.type === "polygon")  { output.textContent = `polygon: ${result.polygon.id}`; return; }
    output.textContent = `lng:${result.cartographic.lng.toFixed(2)} lat:${result.cartographic.lat.toFixed(2)}`;
  });

  output.textContent = "Loading globe – drag to orbit, wheel to zoom, click to inspect.";

  /* ---- performance loop ---- */
  let lastTime = performance.now();
  const perfLoop = () => {
    const now = performance.now();
    perfMonitor.update(now - lastTime);
    animManager.update(now - lastTime);
    lastTime = now;
    (window as any).__perfMonitor = perfMonitor;
    requestAnimationFrame(perfLoop);
  };
  requestAnimationFrame(perfLoop);

  /* ---- expose for devtools ---- */
  if (typeof window !== "undefined") {
    (window as Window & { __globeEngine?: GlobeEngine }).__globeEngine = engine;
  }

  return engine;
}
