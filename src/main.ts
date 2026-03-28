import "./styles.css";

const DEMOS = [
  {
    name: "basic-globe",
    title: "Basic Globe",
    description: "Complete globe with tile imagery, elevation, markers, polylines, polygons, and camera tour",
    tags: ["OSM", "elevation", "markers", "polylines", "polygons"],
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
