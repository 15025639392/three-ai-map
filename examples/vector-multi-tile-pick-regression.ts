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

export function runVectorMultiTilePickRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.leftPointHitKind = "";
  container.dataset.rightPointHitKind = "";
  container.dataset.seamLeftHitKind = "";
  container.dataset.seamRightHitKind = "";
  container.dataset.seamLeftHitLayer = "";
  container.dataset.seamRightHitLayer = "";
  container.dataset.allHitsExpected = "";
  container.dataset.tileBucketCount = "";
  container.dataset.missHitIsVectorFeature = "";
  output.textContent = "启动中:vector-multi-tile-pick-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#04101b"
  });
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      "places-left": { pointSize: 0.05, pointColor: "#ffd46b" },
      "places-right": { pointSize: 0.05, pointColor: "#ff8f6b" },
      "roads-left": { strokeColor: "#e8f2ff" },
      "roads-right": { strokeColor: "#c7deff" }
    }
  });
  const altitude = engine.radius * 0.01;

  vectorLayer.setFeatures([
    {
      type: "point",
      layer: "places-left",
      geometry: [[[-2, 0]]],
      properties: { kind: "left-point-target" }
    },
    {
      type: "line",
      layer: "roads-left",
      geometry: [[[-6, 4], [0, 4]]],
      properties: { kind: "left-seam-line-target" }
    },
    {
      type: "point",
      layer: "places-left",
      geometry: [[[-0.35, 4]]],
      properties: { kind: "left-seam-point-target" }
    }
  ], "tile-left");
  vectorLayer.setFeatures([
    {
      type: "point",
      layer: "places-right",
      geometry: [[[2, 0]]],
      properties: { kind: "right-point-target" }
    },
    {
      type: "line",
      layer: "roads-right",
      geometry: [[[0, 4], [6, 4]]],
      properties: { kind: "right-seam-line-target" }
    },
    {
      type: "point",
      layer: "places-right",
      geometry: [[[0.35, 4]]],
      properties: { kind: "right-seam-point-target" }
    }
  ], "tile-right");

  const finalize = (): void => {
    engine.render();

    const leftPointScreen = projectToScreen(engine, container, -2, 0, altitude);
    const rightPointScreen = projectToScreen(engine, container, 2, 0, altitude);
    const seamLeftScreen = projectToScreen(engine, container, -0.35, 4, altitude);
    const seamRightScreen = projectToScreen(engine, container, 0.35, 4, altitude);
    const leftPointHit = engine.pick(leftPointScreen.x, leftPointScreen.y);
    const rightPointHit = engine.pick(rightPointScreen.x, rightPointScreen.y);
    const seamLeftHit = engine.pick(seamLeftScreen.x, seamLeftScreen.y);
    const seamRightHit = engine.pick(seamRightScreen.x, seamRightScreen.y);
    const missHit = engine.pick(rightPointScreen.x + 220, rightPointScreen.y - 180);
    const leftExpected =
      leftPointHit?.type === "vector-feature" &&
      leftPointHit.feature.properties?.kind === "left-point-target";
    const rightExpected =
      rightPointHit?.type === "vector-feature" &&
      rightPointHit.feature.properties?.kind === "right-point-target";
    const seamLeftExpected =
      seamLeftHit?.type === "vector-feature" &&
      seamLeftHit.feature.properties?.kind === "left-seam-point-target";
    const seamRightExpected =
      seamRightHit?.type === "vector-feature" &&
      seamRightHit.feature.properties?.kind === "right-seam-point-target";
    const allHitsExpected = leftExpected && rightExpected && seamLeftExpected && seamRightExpected ? 1 : 0;
    const missHitIsVectorFeature = missHit?.type === "vector-feature" ? 1 : 0;

    container.dataset.phase = "after-vector-multi-tile-pick";
    container.dataset.leftPointHitKind =
      leftPointHit?.type === "vector-feature" ? String(leftPointHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.rightPointHitKind =
      rightPointHit?.type === "vector-feature" ? String(rightPointHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.seamLeftHitKind =
      seamLeftHit?.type === "vector-feature" ? String(seamLeftHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.seamRightHitKind =
      seamRightHit?.type === "vector-feature" ? String(seamRightHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.seamLeftHitLayer =
      seamLeftHit?.type === "vector-feature" ? seamLeftHit.feature.layer : "none";
    container.dataset.seamRightHitLayer =
      seamRightHit?.type === "vector-feature" ? seamRightHit.feature.layer : "none";
    container.dataset.allHitsExpected = `${allHitsExpected}`;
    container.dataset.tileBucketCount = "2";
    container.dataset.missHitIsVectorFeature = `${missHitIsVectorFeature}`;
    output.textContent =
      `after-vector-multi-tile-pick:all=${allHitsExpected}:` +
      `miss-vector=${missHitIsVectorFeature}`;
  };

  engine.addLayer(vectorLayer);
  engine.setView({ lng: 0, lat: 4, altitude: 2.3 });
  window.setTimeout(finalize, 100);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorMultiTilePickRegression?: {
          engine: GlobeEngine;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__vectorMultiTilePickRegression = {
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
      <div class="demo-status" id="status-output">启动中:vector-multi-tile-pick-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorMultiTilePickRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
