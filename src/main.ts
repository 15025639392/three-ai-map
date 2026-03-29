import "./styles.css";

const DEMOS = [
  {
    name: "basic-globe",
    title: "Basic Globe",
    description: "Complete globe with tile imagery, elevation, markers, polylines, polygons, and camera tour",
    tags: ["OSM", "elevation", "markers", "polylines", "polygons"],
  },
  {
    name: "basic-globe-performance-regression",
    title: "Basic Globe Performance Regression",
    description: "Deterministic regression demo for basic-globe style pan/zoom performance and tile request stability",
    tags: ["regression", "performance", "surface-tiles", "browser-smoke"],
  },
  {
    name: "basic-globe-load-profile-regression",
    title: "Basic Globe Load Profile Regression",
    description: "Deterministic regression demo for baseline/stress load profiles and performance degradation ratio",
    tags: ["regression", "performance", "load-profile", "browser-smoke"],
  },
  {
    name: "basic-globe-load-ladder-regression",
    title: "Basic Globe Load Ladder Regression",
    description: "Deterministic regression demo for baseline/medium/heavy load ladder and monotonic profile constraints",
    tags: ["regression", "performance", "load-ladder", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-regression",
    title: "Basic Globe Load Recovery Regression",
    description: "Deterministic regression demo for heavy-load overlay cleanup and scene/layer recovery constraints",
    tags: ["regression", "performance", "load-recovery", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-stress-regression",
    title: "Basic Globe Load Recovery Stress Regression",
    description: "Deterministic regression demo for multi-cycle heavy-load cleanup and recovery stability constraints",
    tags: ["regression", "performance", "load-recovery-stress", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-endurance-regression",
    title: "Basic Globe Load Recovery Endurance Regression",
    description: "Deterministic regression demo for long-duration heavy/recovery interaction pressure and recovery stability constraints",
    tags: ["regression", "performance", "load-recovery-endurance", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-drift-regression",
    title: "Basic Globe Load Recovery Drift Regression",
    description: "Deterministic regression demo for multi-cycle heavy/recovery drift constraints on recovery consistency",
    tags: ["regression", "performance", "load-recovery-drift", "browser-smoke"],
  },
  {
    name: "oblique-photogrammetry-regression",
    title: "Oblique Photogrammetry Regression",
    description: "Deterministic regression demo for oblique photogrammetry tileset visibility and pick stability",
    tags: ["regression", "oblique-photogrammetry", "3d-tiles", "browser-smoke"],
  },
  {
    name: "gaode-satellite",
    title: "Gaode Satellite",
    description: "Gaode (Amap) satellite imagery with GCJ-02 coordinate transform and elevation",
    tags: ["Gaode", "GCJ-02", "satellite", "elevation"],
  },
  {
    name: "gaode-satellite-labels",
    title: "Gaode Satellite + Labels",
    description: "Gaode satellite base with road/label overlay (dual SurfaceTileLayer)",
    tags: ["Gaode", "GCJ-02", "satellite", "labels"],
  },
  {
    name: "baidu-satellite",
    title: "Baidu Satellite",
    description: "Baidu satellite imagery with BD-09 coordinate transform and elevation",
    tags: ["Baidu", "BD-09", "satellite", "elevation"],
  },
  {
    name: "baidu-road",
    title: "Baidu Road",
    description: "Baidu standard road map with Chinese labels and BD-09 transform",
    tags: ["Baidu", "BD-09", "road"],
  },
  {
    name: "surface-tile-regression",
    title: "Surface Tile Regression",
    description: "Deterministic regression demo for SurfaceTileLayer selection updates without camera motion",
    tags: ["regression", "surface-tiles", "browser-smoke"],
  },
  {
    name: "surface-tile-resize-regression",
    title: "Surface Tile Resize Regression",
    description: "Deterministic regression demo for SurfaceTileLayer viewport resize and tile reselection",
    tags: ["regression", "surface-tiles", "resize", "browser-smoke"],
  },
  {
    name: "surface-tile-zoom-regression",
    title: "Surface Tile Zoom Regression",
    description: "Deterministic regression demo for camera zoom, request cancellation and performance metrics",
    tags: ["regression", "surface-tiles", "zoom", "performance"],
  },
  {
    name: "surface-tile-recovery-stages-regression",
    title: "Surface Tile Recovery Stages Regression",
    description: "Deterministic regression demo for tile-load/tile-parse recovery policy metrics",
    tags: ["regression", "surface-tiles", "recovery-policy", "browser-smoke"],
  },
  {
    name: "surface-tile-coord-transform-regression",
    title: "Surface Tile Coord Transform Regression",
    description: "Deterministic regression demo for SurfaceTile coordTransform geometry consistency",
    tags: ["regression", "surface-tiles", "coord-transform", "browser-smoke"],
  },
  {
    name: "surface-tile-lifecycle-regression",
    title: "Surface Tile Lifecycle Regression",
    description: "Deterministic regression demo for SurfaceTile add/remove/re-add lifecycle consistency",
    tags: ["regression", "surface-tiles", "lifecycle", "browser-smoke"],
  },
  {
    name: "surface-tile-lifecycle-stress-regression",
    title: "Surface Tile Lifecycle Stress Regression",
    description: "Deterministic regression demo for multi-cycle SurfaceTile lifecycle stress consistency",
    tags: ["regression", "surface-tiles", "lifecycle", "stress", "browser-smoke"],
  },
  {
    name: "vector-tile-regression",
    title: "Vector Tile Regression",
    description: "Deterministic regression demo for VectorTile point/line/polygon rendering",
    tags: ["regression", "vector-tiles", "mvt", "browser-smoke"],
  },
  {
    name: "projection-regression",
    title: "Projection Regression",
    description: "Deterministic regression demo for GCJ/BD coordinate transform round-trip precision",
    tags: ["regression", "projection", "gcj02", "bd09"],
  },
  {
    name: "terrarium-decode-regression",
    title: "Terrarium Decode Regression",
    description: "Deterministic regression demo for Terrarium decode worker hit-rate and fallback metrics",
    tags: ["regression", "terrarium", "worker", "browser-smoke"],
  },
  {
    name: "vector-pick-regression",
    title: "Vector Pick Regression",
    description: "Deterministic regression demo for VectorTile pick precision in browser output",
    tags: ["regression", "vector-tiles", "pick", "browser-smoke"],
  },
  {
    name: "vector-geometry-pick-regression",
    title: "Vector Geometry Pick Regression",
    description: "Deterministic regression demo for VectorTile point/line/polygon pick precision",
    tags: ["regression", "vector-tiles", "pick", "geometry", "browser-smoke"],
  },
  {
    name: "vector-multi-tile-pick-regression",
    title: "Vector Multi Tile Pick Regression",
    description: "Deterministic regression demo for VectorTile cross-tile boundary pick stability",
    tags: ["regression", "vector-tiles", "pick", "multi-tile", "browser-smoke"],
  },
  {
    name: "vector-overlap-pick-regression",
    title: "Vector Overlap Pick Regression",
    description: "Deterministic regression demo for VectorTile overlap pick priority by zIndex and depth",
    tags: ["regression", "vector-tiles", "pick", "overlap", "browser-smoke"],
  },
  {
    name: "vector-layer-zindex-pick-regression",
    title: "Vector Layer ZIndex Pick Regression",
    description: "Deterministic regression demo for cross-layer VectorTile pick precedence by layer zIndex",
    tags: ["regression", "vector-tiles", "pick", "zindex", "browser-smoke"],
  },
];

export function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  const demoCards = DEMOS.map(
    (d) => `
    <a class="demo-card" href="/${d.name}.html">
      <div class="demo-card-header">
        <h2>${d.title}</h2>
        <span class="demo-arrow">&rarr;</span>
      </div>
      <p class="demo-card-desc">${d.description}</p>
      <div class="demo-card-tags">${d.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    </a>`
  ).join("");

  app.innerHTML = `
    <main class="index-shell">
      <header class="index-header">
        <p class="eyebrow">Three-Map</p>
        <h1>Demos</h1>
        <p class="index-subtitle">
          A 3-D globe engine built on Three.js &mdash; tile imagery, elevation, markers,
          polylines, polygons, coordinate transforms and more.
        </p>
      </header>
      <div class="demo-grid">${demoCards}</div>
    </main>
  `;
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  render();
}
