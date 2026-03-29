import "../src/styles.css";
import { Vector3 } from "three";
import { GlobeEngine, VectorTileLayer } from "../src";
import { cartographicToCartesian } from "../src/geo/projection";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function projectToScreen(
  engine: GlobeEngine,
  container: HTMLElement,
  lng: number,
  lat: number,
  altitude: number
): { x: number; y: number } {
  const point = cartographicToCartesian({ lng, lat, height: altitude }, engine.radius);
  const clip = new Vector3(point.x, point.y, point.z).project(engine.sceneSystem.camera);
  const rect = container.getBoundingClientRect();

  return {
    x: rect.left + (clip.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - (clip.y + 1) * 0.5) * rect.height
  };
}

export function runVectorOverlapPickRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.zIndexHitKind = "";
  container.dataset.zIndexHitLayer = "";
  container.dataset.depthHitKind = "";
  container.dataset.depthHitLayer = "";
  container.dataset.zIndexHitIsExpected = "";
  container.dataset.depthHitIsExpected = "";
  container.dataset.allHitsExpected = "";
  container.dataset.missHitIsVectorFeature = "";
  output.textContent = "启动中:vector-overlap-pick-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#06121d"
  });
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      "places-low": { pointSize: 0.05, pointColor: "#8aa5ff", zIndex: 1, altitude: 0.01 },
      "places-high": { pointSize: 0.05, pointColor: "#ffd46b", zIndex: 12, altitude: 0.01 },
      "depth-far": { pointSize: 0.05, pointColor: "#7de2ff", zIndex: 6, altitude: 0.01 },
      "depth-near": { pointSize: 0.05, pointColor: "#ff956f", zIndex: 6, altitude: 0.08 }
    }
  });
  const zIndexAltitude = 0.01;
  const depthNearAltitude = 0.08;

  vectorLayer.setFeatures([
    {
      type: "point",
      layer: "places-low",
      geometry: [[[0, 0]]],
      properties: { kind: "overlap-zindex-low-target" }
    },
    {
      type: "point",
      layer: "places-high",
      geometry: [[[0, 0]]],
      properties: { kind: "overlap-zindex-high-target" }
    },
    {
      type: "point",
      layer: "depth-far",
      geometry: [[[8, 0]]],
      properties: { kind: "overlap-depth-far-target" }
    },
    {
      type: "point",
      layer: "depth-near",
      geometry: [[[8, 0]]],
      properties: { kind: "overlap-depth-near-target" }
    }
  ]);

  const finalize = (): void => {
    engine.render();

    const zIndexScreen = projectToScreen(engine, container, 0, 0, zIndexAltitude);
    const depthScreen = projectToScreen(engine, container, 8, 0, depthNearAltitude);
    const zIndexHit = engine.pick(zIndexScreen.x, zIndexScreen.y);
    const depthHit = engine.pick(depthScreen.x, depthScreen.y);
    const missHit = engine.pick(depthScreen.x + 240, depthScreen.y - 180);

    const zIndexExpected =
      zIndexHit?.type === "vector-feature" &&
      zIndexHit.feature.layer === "places-high" &&
      zIndexHit.feature.properties?.kind === "overlap-zindex-high-target";
    const depthExpected =
      depthHit?.type === "vector-feature" &&
      depthHit.feature.layer === "depth-near" &&
      depthHit.feature.properties?.kind === "overlap-depth-near-target";
    const allHitsExpected = zIndexExpected && depthExpected ? 1 : 0;
    const missHitIsVectorFeature = missHit?.type === "vector-feature" ? 1 : 0;

    container.dataset.phase = "after-vector-overlap-pick";
    container.dataset.zIndexHitKind =
      zIndexHit?.type === "vector-feature" ? String(zIndexHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.zIndexHitLayer =
      zIndexHit?.type === "vector-feature" ? zIndexHit.feature.layer : "none";
    container.dataset.depthHitKind =
      depthHit?.type === "vector-feature" ? String(depthHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.depthHitLayer =
      depthHit?.type === "vector-feature" ? depthHit.feature.layer : "none";
    container.dataset.zIndexHitIsExpected = zIndexExpected ? "1" : "0";
    container.dataset.depthHitIsExpected = depthExpected ? "1" : "0";
    container.dataset.allHitsExpected = `${allHitsExpected}`;
    container.dataset.missHitIsVectorFeature = `${missHitIsVectorFeature}`;
    output.textContent =
      `after-vector-overlap-pick:all=${allHitsExpected}:` +
      `miss-vector=${missHitIsVectorFeature}`;
  };

  engine.addLayer(vectorLayer);
  engine.setView({ lng: 4, lat: 0, altitude: 2.25 });
  window.setTimeout(finalize, 100);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorOverlapPickRegression?: {
          engine: GlobeEngine;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__vectorOverlapPickRegression = {
      engine,
      vectorLayer
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
      <div class="demo-status" id="status-output">启动中:vector-overlap-pick-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorOverlapPickRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
