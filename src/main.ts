import "./styles.css";

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
          <div class="readout" id="pick-output">Loading globe runtime...</div>
        </aside>
      </section>
    </main>
  `;

  const stage = container.querySelector<HTMLElement>("#globe-stage");
  const output = container.querySelector<HTMLElement>("#pick-output");

  if (!stage || !output) {
    throw new Error("Missing demo mount points");
  }

  const { runBasicGlobe } = await import("../examples/basic-globe");
  runBasicGlobe(stage, output);
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
