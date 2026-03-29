import "../src/styles.css";
import {
  GlobeEngine,
  bd09ToGcj02,
  gcj02ToBd09,
  gcj02ToWgs84,
  haversineDistance,
  wgs84ToBd09,
  wgs84ToGcj02
} from "../src";

interface Coordinate {
  lng: number;
  lat: number;
}

interface ProjectionRoundtripMetrics {
  maxWgsGcjWgsErrorMeters: number;
  maxGcjBdGcjErrorMeters: number;
  maxWgsBdWgsErrorMeters: number;
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function toFixedNumber(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function computeProjectionRoundtripMetrics(): ProjectionRoundtripMetrics {
  const samples: Coordinate[] = [
    { lng: 116.404, lat: 39.915 }, // Beijing
    { lng: 121.474, lat: 31.23 },  // Shanghai
    { lng: 113.2644, lat: 23.1291 } // Guangzhou
  ];

  let maxWgsGcjWgsErrorMeters = 0;
  let maxGcjBdGcjErrorMeters = 0;
  let maxWgsBdWgsErrorMeters = 0;

  for (const sample of samples) {
    const gcj = wgs84ToGcj02(sample);
    const wgsFromGcj = gcj02ToWgs84(gcj);
    maxWgsGcjWgsErrorMeters = Math.max(
      maxWgsGcjWgsErrorMeters,
      haversineDistance(sample, wgsFromGcj)
    );

    const bdFromGcj = gcj02ToBd09(gcj);
    const gcjFromBd = bd09ToGcj02(bdFromGcj);
    maxGcjBdGcjErrorMeters = Math.max(
      maxGcjBdGcjErrorMeters,
      haversineDistance(gcj, gcjFromBd)
    );

    const bdFromWgs = wgs84ToBd09(sample);
    const wgsFromBd = gcj02ToWgs84(bd09ToGcj02(bdFromWgs));
    maxWgsBdWgsErrorMeters = Math.max(
      maxWgsBdWgsErrorMeters,
      haversineDistance(sample, wgsFromBd)
    );
  }

  return {
    maxWgsGcjWgsErrorMeters: toFixedNumber(maxWgsGcjWgsErrorMeters),
    maxGcjBdGcjErrorMeters: toFixedNumber(maxGcjBdGcjErrorMeters),
    maxWgsBdWgsErrorMeters: toFixedNumber(maxWgsBdWgsErrorMeters)
  };
}

export function runProjectionRegression(container: HTMLElement, output: HTMLElement): GlobeEngine {
  setStageSize(container, 960, 540);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#03101b"
  });

  container.dataset.phase = "booting";
  container.dataset.maxWgsGcjWgsErrorMeters = "";
  container.dataset.maxGcjBdGcjErrorMeters = "";
  container.dataset.maxWgsBdWgsErrorMeters = "";
  output.textContent = "启动中:projection-regression";

  engine.setView({ lng: 108, lat: 32, altitude: 2.5 });

  window.setTimeout(() => {
    const metrics = computeProjectionRoundtripMetrics();
    engine.render();
    container.dataset.phase = "after-projection";
    container.dataset.maxWgsGcjWgsErrorMeters = `${metrics.maxWgsGcjWgsErrorMeters}`;
    container.dataset.maxGcjBdGcjErrorMeters = `${metrics.maxGcjBdGcjErrorMeters}`;
    container.dataset.maxWgsBdWgsErrorMeters = `${metrics.maxWgsBdWgsErrorMeters}`;
    output.textContent = `after-projection:${metrics.maxWgsGcjWgsErrorMeters}/${metrics.maxGcjBdGcjErrorMeters}/${metrics.maxWgsBdWgsErrorMeters}`;
  }, 0);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __projectionRegression?: {
          engine: GlobeEngine;
        };
      }
    ).__projectionRegression = {
      engine
    };
  }

  return engine;
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container");
  }

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">启动中:projection-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runProjectionRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
