import { CanvasTexture } from "three";
import { GlobeEngine } from "../src/engine/GlobeEngine";
import { ElevationLayer } from "../src/layers/ElevationLayer";
import { ImageryLayer } from "../src/layers/ImageryLayer";
import { SurfaceTileLayer } from "../src/layers/SurfaceTileLayer";
import { TiledImageryLayer } from "../src/layers/TiledImageryLayer";

function createProceduralEarthTexture(size = 2048): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("2D canvas context is not available");
  }

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#0e203f");
  ocean.addColorStop(0.45, "#163a6f");
  ocean.addColorStop(1, "#08142b");
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(195, 223, 255, 0.16)";
  context.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += canvas.width / 12) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = 0; y <= canvas.height; y += canvas.height / 6) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.fillStyle = "#4e8b5a";

  const shapes = [
    [
      [0.12, 0.18],
      [0.21, 0.12],
      [0.28, 0.16],
      [0.26, 0.28],
      [0.19, 0.36],
      [0.13, 0.3]
    ],
    [
      [0.3, 0.48],
      [0.34, 0.36],
      [0.41, 0.34],
      [0.44, 0.52],
      [0.37, 0.72],
      [0.31, 0.64]
    ],
    [
      [0.48, 0.16],
      [0.6, 0.12],
      [0.72, 0.18],
      [0.83, 0.22],
      [0.79, 0.34],
      [0.68, 0.31],
      [0.57, 0.28],
      [0.5, 0.24]
    ],
    [
      [0.62, 0.44],
      [0.69, 0.42],
      [0.75, 0.48],
      [0.72, 0.59],
      [0.64, 0.57]
    ],
    [
      [0.82, 0.68],
      [0.88, 0.66],
      [0.9, 0.74],
      [0.84, 0.77]
    ]
  ];

  for (const shape of shapes) {
    context.beginPath();
    shape.forEach(([u, v], index) => {
      const x = u * canvas.width;
      const y = v * canvas.height;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.fill();
  }

  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  context.beginPath();
  context.ellipse(canvas.width * 0.28, canvas.height * 0.18, 180, 80, 0.2, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(canvas.width * 0.72, canvas.height * 0.22, 220, 90, -0.1, 0, Math.PI * 2);
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function runBasicGlobe(container: HTMLElement, output: HTMLElement): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const baseImagery = new TiledImageryLayer("imagery-tiles", {
    minZoom: 1,
    maxZoom: 8,
    tileSize: 128,
    cacheSize: 48,
    concurrency: 4
  });
  const baseElevation = new ElevationLayer("elevation-tiles", {
    zoom: 3,
    tileSize: 256,
    cacheSize: 24,
    concurrency: 4,
    exaggeration: 1
  });
  const surfaceTiles = new SurfaceTileLayer("surface-tiles", {
    minZoom: 3,
    maxZoom: 11,
    tileSize: 128,
    meshSegments: 16,
    cacheSize: 96,
    concurrency: 6,
    elevationExaggeration: 1,
    zoomExaggerationBoost: 6,
    textureUvInsetPixels:1,
    skirtDepthMeters: 1400
  });
  engine.addLayer(baseImagery);
  engine.addLayer(baseElevation);
  engine.addLayer(surfaceTiles);
  baseImagery.ready().catch(() => {
    engine.removeLayer("imagery-tiles");
    engine.addLayer(new ImageryLayer("imagery-fallback", createProceduralEarthTexture()));
    output.textContent = "Online tiles failed, switched to fallback imagery";
  });
  baseElevation.ready().catch(() => {
    output.textContent = "Real elevation failed, kept procedural terrain fallback";
  });
  surfaceTiles.ready().catch(() => {
    output.textContent = "Surface detail tiles failed, kept base globe fallback";
  });
  // engine.addMarker({
  //   id: "shanghai",
  //   lng: 121.4737,
  //   lat: 31.2304,
  //   altitude: 0.03,
  //   color: "#ffd166"
  // });
  // engine.addMarker({
  //   id: "new-york",
  //   lng: -74.006,
  //   lat: 40.7128,
  //   altitude: 0.03,
  //   color: "#6ad8ff"
  // });
  // engine.addMarker({
  //   id: "cape-town",
  //   lng: 18.4241,
  //   lat: -33.9249,
  //   altitude: 0.03,
  //   color: "#ff8f70"
  // });
  // engine.addPolyline({
  //   id: "trade-route",
  //   coordinates: [
  //     { lng: 121.4737, lat: 31.2304, altitude: 0.02 },
  //     { lng: 77.209, lat: 28.6139, altitude: 0.08 },
  //     { lng: 18.4241, lat: -33.9249, altitude: 0.02 }
  //   ],
  //   color: "#8ed6ff"
  // });
  // engine.addPolygon({
  //   id: "focus-region",
  //   coordinates: [
  //     { lng: 95, lat: 10, altitude: 0.015 },
  //     { lng: 128, lat: 10, altitude: 0.015 },
  //     { lng: 128, lat: 38, altitude: 0.015 },
  //     { lng: 95, lat: 38, altitude: 0.015 }
  //   ],
  //   fillColor: "#36d695",
  //   opacity: 0.35
  // });

  engine.setView({
    lng: 110,
    lat: 28,
    altitude: 2.4
  });

  engine.on("click", ({ pickResult: result }) => {

    if (!result) {
      output.textContent = "Nothing picked";
      return;
    }

    if (result.type === "marker") {
      output.textContent = `marker:${result.marker.id}`;
      return;
    }

    if (result.type === "polyline") {
      output.textContent = `polyline:${result.polyline.id}`;
      return;
    }

    if (result.type === "polygon") {
      output.textContent = `polygon:${result.polygon.id}`;
      return;
    }

    output.textContent = `lng:${result.cartographic.lng.toFixed(2)} lat:${result.cartographic.lat.toFixed(2)}`;
  });

  output.textContent =
    "Phase 5 surface tile meshes are loading. Click a marker, route, region or the globe.";

  if (typeof window !== "undefined") {
    (window as Window & { __globeEngine?: GlobeEngine }).__globeEngine = engine;
  }

  return engine;
}
