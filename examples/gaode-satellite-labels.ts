import "../src/styles.css";
import { runGaodeSatelliteLabels } from "./tile-sources-gaode-baidu";

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">Back to Demos</a>
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">Loading Gaode satellite + labels...</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runGaodeSatelliteLabels(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
