import "../src/styles.css";
import { computeTargetZoom } from "../src/tiles/TileViewport";

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">正在加载地球...</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const statusOutput = app.querySelector<HTMLElement>("#status-output");
  if (!stage || !statusOutput) return;

  void import("./basic-globe").then(({ runBasicGlobe }) => {
    const engine = runBasicGlobe(stage, statusOutput);

    if (engine) {
      const tick = (): void => {
        try {
          const view = engine.getView();
          const vw = stage.clientWidth || 1;
          const vh = stage.clientHeight || 1;
          const z = computeTargetZoom({
            camera: engine.sceneSystem.camera,
            viewportWidth: vw,
            viewportHeight: vh,
            radius: engine.radius,
            tileSize: 256,
            minZoom: 1,
            maxZoom: 22,
          });
          statusOutput.textContent =
            `lng:${view.lng.toFixed(4)} lat:${view.lat.toFixed(4)} alt:${view.altitude.toFixed(3)} z:${z.toFixed(2)}`;
        } catch {
          /* ignore during init */
        }
      };
      tick();
      const id = window.setInterval(tick, 200);
      window.addEventListener("beforeunload", () => window.clearInterval(id), { once: true });
    }
  });
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
