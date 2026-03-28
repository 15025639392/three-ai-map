import "./styles.css";
import { computeTargetZoom } from "./tiles/TileViewport";
import type { GlobeEngine } from "./index";

/* ------------------------------------------------------------------ */
/*  City data shared between UI and globe                              */
/* ------------------------------------------------------------------ */

const CITIES = [
  { name: "Shanghai",  lng: 121.47, lat: 31.23,  color: "#ffd166" },
  { name: "Tokyo",     lng: 139.69, lat: 35.69,  color: "#ff8f70" },
  { name: "New York",  lng: -74.00, lat: 40.71,  color: "#6ad8ff" },
  { name: "London",    lng:  -0.12, lat: 51.51,  color: "#c084fc" },
  { name: "Sydney",    lng: 151.21, lat:-33.87,  color: "#36d695" },
  { name: "São Paulo", lng: -46.63, lat:-23.55,  color: "#fb923c" },
  { name: "Dubai",     lng:  55.27, lat: 25.20,  color: "#f472b6" },
  { name: "Cape Town", lng:  18.42, lat:-33.92,  color: "#38bdf8" },
];

const ROUTES = [
  { from: "Shanghai",  to: "New York" },
  { from: "London",    to: "Tokyo"    },
  { from: "Dubai",     to: "Sydney"   },
  { from: "São Paulo", to: "Cape Town"},
];

/* ------------------------------------------------------------------ */
/*  Mount                                                              */
/* ------------------------------------------------------------------ */

export async function mountApp(container: HTMLElement): Promise<void> {
  const cityItems = CITIES.map(c =>
    `<li class="city-item" data-lng="${c.lng}" data-lat="${c.lat}" data-name="${c.name}">
       <span class="city-dot" style="background:${c.color}"></span>
       <span class="city-name">${c.name}</span>
     </li>`
  ).join("");

  const routeItems = ROUTES.map(r =>
    `<li class="route-item">
       <span>${r.from}</span><span class="route-arrow">&rarr;</span><span>${r.to}</span>
     </li>`
  ).join("");

  container.innerHTML = `
    <main class="shell">
      <section class="intro">
        <p class="eyebrow">Three-Map v1.0</p>
        <h1>Globe Engine Demo</h1>
        <p>
          A complete 3-D globe engine built on Three.js &mdash; tile imagery, elevation, markers,
          polylines, polygons, flight-arc animation, performance monitoring and more.
        </p>
      </section>

      <section class="workspace">
        <div class="viewport" id="globe-stage"></div>

        <aside class="panel">
          <h2>Controls</h2>
          <p>Drag to orbit &middot; Scroll to zoom &middot; Click to inspect &middot; Click a city below to fly</p>

          <div class="readout" id="view-output">View: loading...</div>
          <div class="readout" id="perf-output">FPS: --</div>
          <div class="readout" id="pick-output">Loading globe&hellip;</div>

          <h2>Cities</h2>
          <ul class="city-list">${cityItems}</ul>

          <h2>Flight Arcs</h2>
          <ul class="route-list">${routeItems}</ul>
        </aside>
      </section>
    </main>
  `;

  const stage      = container.querySelector<HTMLElement>("#globe-stage");
  const viewOutput = container.querySelector<HTMLElement>("#view-output");
  const perfOutput = container.querySelector<HTMLElement>("#perf-output");
  const pickOutput = container.querySelector<HTMLElement>("#pick-output");

  if (!stage || !viewOutput || !perfOutput || !pickOutput) {
    throw new Error("Missing demo mount points");
  }

  /* ---- engine ---- */
  const { runBasicGlobe } = await import("../examples/basic-globe");
  const engine = runBasicGlobe(stage, pickOutput);

  if (!engine) {
    viewOutput.textContent = "View: unavailable";
    return;
  }

  /* ---- city fly-to ---- */
  container.querySelector(".city-list")!.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".city-item");
    if (!target) return;
    const lng = Number(target.dataset.lng);
    const lat = Number(target.dataset.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const from = engine.getView();
    const to   = { lng, lat, altitude: 1.6 };
    const start = performance.now();
    const duration = 1800;

    const step = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
      engine.setView({
        lng: from.lng + (to.lng - from.lng) * ease,
        lat: from.lat + (to.lat - from.lat) * ease,
        altitude: from.altitude + (to.altitude - from.altitude) * ease,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  /* ---- URL params ---- */
  const params = new URLSearchParams(window.location.search);
  const urlLng = Number(params.get("lng"));
  const urlLat = Number(params.get("lat"));
  const urlAlt = Number(params.get("alt"));
  const urlZoom = Number(params.get("z"));

  if (Number.isFinite(urlLng) && Number.isFinite(urlLat) && Number.isFinite(urlAlt)) {
    engine.setView({ lng: urlLng, lat: urlLat, altitude: urlAlt });
  } else if (Number.isFinite(urlLng) && Number.isFinite(urlLat) && Number.isFinite(urlZoom)) {
    const altitude = (engine.radius * 4) / 2 ** Math.max(0, urlZoom);
    engine.setView({ lng: urlLng, lat: urlLat, altitude });
  }

  /* ---- periodic readouts ---- */
  const tick = (): void => {
    // view
    try {
      const view = engine.getView();
      const vw = stage.clientWidth  || 1;
      const vh = stage.clientHeight || 1;
      const z  = computeTargetZoom({
        camera: engine.sceneSystem.camera,
        viewportWidth: vw,
        viewportHeight: vh,
        radius: engine.radius,
        tileSize: 256,
        minZoom: 1,
        maxZoom: 22,
      });
      viewOutput.textContent =
        `lng:${view.lng.toFixed(4)} lat:${view.lat.toFixed(4)} alt:${view.altitude.toFixed(3)} z:${z.toFixed(2)}`;
    } catch { /* ignore during init */ }

    // perf
    const pm = (window as any).__perfMonitor;
    if (pm) {
      const fps = pm.getFPS();
      const drops = pm.getFrameDrops();
      perfOutput.textContent = `FPS: ${fps.toFixed(1)} | Drops: ${drops}`;
    }
  };

  tick();
  const id = window.setInterval(tick, 200);
  window.addEventListener("beforeunload", () => window.clearInterval(id), { once: true });
}

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                          */
/* ------------------------------------------------------------------ */

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");
  void mountApp(app);
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
