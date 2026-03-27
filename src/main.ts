import "./styles.css";
import { runBasicGlobe } from "../examples/basic-globe";

export function mountApp(container: HTMLElement): void {
  container.innerHTML = `
    <main class="shell">
      <section class="intro">
        <p class="eyebrow">Phase 3</p>
        <h1>Three.js Globe Engine</h1>
        <p>
          Online raster tiles, tile caching, procedural terrain, atmosphere, starfield,
          unified click events and on-demand rendering are now wired into a single third-phase demo.
        </p>
      </section>
      <section class="workspace">
        <div class="viewport" id="globe-stage"></div>
        <aside class="panel">
          <h2>Interaction</h2>
          <p>Drag to orbit, wheel to zoom, cross the poles freely, then inspect online tiles, terrain relief and unified click events with lng/lat coordinates.</p>
          <div class="readout" id="pick-output"></div>
        </aside>
      </section>
    </main>
  `;

  const stage = container.querySelector<HTMLElement>("#globe-stage");
  const output = container.querySelector<HTMLElement>("#pick-output");

  if (!stage || !output) {
    throw new Error("Missing demo mount points");
  }

  runBasicGlobe(stage, output);
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");

  if (!app) {
    throw new Error("Missing #app container");
  }

  mountApp(app);
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
