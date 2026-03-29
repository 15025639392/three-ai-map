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

export function runVectorGeometryPickRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.pointHitType = "";
  container.dataset.pointHitLayer = "";
  container.dataset.pointHitKind = "";
  container.dataset.lineHitType = "";
  container.dataset.lineHitLayer = "";
  container.dataset.lineHitKind = "";
  container.dataset.polygonHitType = "";
  container.dataset.polygonHitLayer = "";
  container.dataset.polygonHitKind = "";
  container.dataset.allHitsExpected = "";
  container.dataset.missHitIsVectorFeature = "";
  output.textContent = "启动中:vector-geometry-pick-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#04101b"
  });
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      places: { pointSize: 0.05, pointColor: "#ffd46b" },
      roads: { strokeColor: "#f2f3f7" },
      landuse: { fillColor: "#5fda93", opacity: 0.6 }
    }
  });
  const altitude = engine.radius * 0.01;

  vectorLayer.setFeatures([
    {
      type: "point",
      layer: "places",
      geometry: [[[0, 0]]],
      properties: { kind: "point-target" }
    },
    {
      type: "line",
      layer: "roads",
      geometry: [[[10, -5], [18, 2]]],
      properties: { kind: "line-target" }
    },
    {
      type: "polygon",
      layer: "landuse",
      geometry: [[[-18, 2], [-12, 2], [-12, 8], [-18, 8], [-18, 2]]],
      properties: { kind: "polygon-target" }
    }
  ]);

  const finalize = (): void => {
    engine.render();

    const pointScreen = projectToScreen(engine, container, 0, 0, altitude);
    const lineScreen = projectToScreen(engine, container, 14, -1.5, altitude);
    const polygonScreen = projectToScreen(engine, container, -15, 5, altitude);
    const pointHit = engine.pick(pointScreen.x, pointScreen.y);
    const lineHit = engine.pick(lineScreen.x, lineScreen.y);
    const polygonHit = engine.pick(polygonScreen.x, polygonScreen.y);
    const missHit = engine.pick(pointScreen.x, pointScreen.y - 180);
    const pointExpected =
      pointHit?.type === "vector-feature" &&
      pointHit.feature.type === "point" &&
      pointHit.feature.layer === "places" &&
      pointHit.feature.properties?.kind === "point-target";
    const lineExpected =
      lineHit?.type === "vector-feature" &&
      lineHit.feature.type === "line" &&
      lineHit.feature.layer === "roads" &&
      lineHit.feature.properties?.kind === "line-target";
    const polygonExpected =
      polygonHit?.type === "vector-feature" &&
      polygonHit.feature.type === "polygon" &&
      polygonHit.feature.layer === "landuse" &&
      polygonHit.feature.properties?.kind === "polygon-target";
    const allHitsExpected = pointExpected && lineExpected && polygonExpected ? 1 : 0;
    const missHitIsVectorFeature = missHit?.type === "vector-feature" ? 1 : 0;

    container.dataset.phase = "after-vector-geometry-pick";
    container.dataset.pointHitType = pointHit?.type ?? "none";
    container.dataset.pointHitLayer =
      pointHit?.type === "vector-feature" ? pointHit.feature.layer : "none";
    container.dataset.pointHitKind =
      pointHit?.type === "vector-feature" ? String(pointHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.lineHitType = lineHit?.type ?? "none";
    container.dataset.lineHitLayer =
      lineHit?.type === "vector-feature" ? lineHit.feature.layer : "none";
    container.dataset.lineHitKind =
      lineHit?.type === "vector-feature" ? String(lineHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.polygonHitType = polygonHit?.type ?? "none";
    container.dataset.polygonHitLayer =
      polygonHit?.type === "vector-feature" ? polygonHit.feature.layer : "none";
    container.dataset.polygonHitKind =
      polygonHit?.type === "vector-feature"
        ? String(polygonHit.feature.properties?.kind ?? "none")
        : "none";
    container.dataset.allHitsExpected = `${allHitsExpected}`;
    container.dataset.missHitIsVectorFeature = `${missHitIsVectorFeature}`;
    output.textContent =
      `after-vector-geometry-pick:all=${allHitsExpected}:` +
      `miss-vector=${missHitIsVectorFeature}`;
  };

  engine.addLayer(vectorLayer);
  engine.setView({ lng: 0, lat: 4, altitude: 2.3 });
  window.setTimeout(finalize, 100);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorGeometryPickRegression?: {
          engine: GlobeEngine;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__vectorGeometryPickRegression = {
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
      <div class="demo-status" id="status-output">启动中:vector-geometry-pick-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorGeometryPickRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
