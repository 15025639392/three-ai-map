import "./styles.css";
import { computeTargetZoom } from "./tiles/TileViewport";

export async function mountApp(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="shell">
      <section class="intro">
        <p class="eyebrow">Phase 5</p>
        <h1>Three.js Globe Engine</h1>
        <p>
          Unified surface tile meshes now combine imagery and DEM on curved globe patches over a
          lightweight base globe, while the runtime keeps atmospheric rendering, unified events and
          inertia controls.
        </p>
      </section>
      <section class="workspace">
        <div class="viewport" id="globe-stage"></div>
        <aside class="panel">
          <h2>Interaction</h2>
          <p>Drag to orbit with inertia, wheel to zoom with inertia, cross the poles freely, then inspect phase-5 surface tile meshes, deep zoom imagery, terrain detail and unified click events with lng/lat coordinates.</p>
          <div class="readout" id="view-output">View: loading...</div>
          <div class="readout" id="pick-output">Loading globe runtime...</div>
        </aside>
      </section>
    </main>
  `;

  const stage = container.querySelector<HTMLElement>("#globe-stage");
  const viewOutput = container.querySelector<HTMLElement>("#view-output");
  const output = container.querySelector<HTMLElement>("#pick-output");

  if (!stage || !output || !viewOutput) {
    throw new Error("Missing demo mount points");
  }

  const { runBasicGlobe } = await import("../examples/basic-globe");
  const engine = runBasicGlobe(stage, output);

  if (!engine) {
    viewOutput.textContent = "View: unavailable";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  const altitude = Number(params.get("alt"));
  const zoom = Number(params.get("z"));
  const canSetView = typeof (engine as { setView?: unknown }).setView === "function";
  const canReadView = typeof (engine as { getView?: unknown }).getView === "function";
  const hasSceneCamera = Boolean((engine as { sceneSystem?: { camera?: unknown } }).sceneSystem?.camera);
  const hasRadius = Number.isFinite((engine as { radius?: number }).radius);

  const computeAltitudeFromZoom = (z: number): number => {
    const safeZoom = Math.max(0, z);
    return (engine.radius * 4) / 2 ** safeZoom;
  };

  const updateViewReadout = (): void => {
    if (!canReadView || !hasSceneCamera || !hasRadius) {
      viewOutput.textContent = "View: unavailable";
      return;
    }

    const view = engine.getView();
    const viewportWidth = stage.clientWidth || stage.getBoundingClientRect().width || 1;
    const viewportHeight = stage.clientHeight || stage.getBoundingClientRect().height || 1;
    const estimatedZoom = computeTargetZoom({
      camera: engine.sceneSystem.camera,
      viewportWidth,
      viewportHeight,
      radius: engine.radius,
      tileSize: 256,
      minZoom: 1,
      maxZoom: 22
    });
    const lngText = view.lng.toFixed(6);
    const latText = view.lat.toFixed(6);
    const altitudeText = view.altitude.toFixed(6);
    const zoomText = estimatedZoom.toFixed(3);

    viewOutput.textContent =
      `lng:${lngText} lat:${latText} alt:${altitudeText} z:${zoomText}`;
  };

  if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(altitude)) {
    if (canSetView) {
      engine.setView({ lng, lat, altitude });
    }
  } else if (Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom)) {
    if (canSetView) {
      engine.setView({ lng, lat, altitude: computeAltitudeFromZoom(zoom) });
    }
  }

  updateViewReadout();
  const viewReadoutIntervalId = window.setInterval(updateViewReadout, 120);
  window.addEventListener("beforeunload", () => {
    window.clearInterval(viewReadoutIntervalId);
  }, { once: true });
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");

  if (!app) {
    throw new Error("Missing #app container");
  }

  void mountApp(app);
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
