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

export function runVectorLayerZIndexPickRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.topLayerHitKind = "";
  container.dataset.topLayerHitLayer = "";
  container.dataset.hiddenFallbackHitKind = "";
  container.dataset.hiddenFallbackHitLayer = "";
  container.dataset.allHitsExpected = "";
  container.dataset.missHitIsVectorFeature = "";
  output.textContent = "启动中:vector-layer-zindex-pick-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#07121e"
  });
  const lowLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      "places-low": {
        pointSize: 0.05,
        pointColor: "#7ea2ff"
      }
    }
  });
  const highLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      "places-high": {
        pointSize: 0.05,
        pointColor: "#ffd46b"
      }
    }
  });
  const altitude = engine.radius * 0.01;
  lowLayer.zIndex = 2;
  highLayer.zIndex = 12;

  lowLayer.setFeatures([
    {
      type: "point",
      layer: "places-low",
      geometry: [[[0, 0]]],
      properties: { kind: "low-layer-target" }
    }
  ]);
  highLayer.setFeatures([
    {
      type: "point",
      layer: "places-high",
      geometry: [[[0, 0]]],
      properties: { kind: "high-layer-target" }
    }
  ]);

  const finalize = (): void => {
    engine.render();

    const targetScreen = projectToScreen(engine, container, 0, 0, altitude);
    const topLayerHit = engine.pick(targetScreen.x, targetScreen.y);

    highLayer.visible = false;
    engine.render();
    const hiddenFallbackHit = engine.pick(targetScreen.x, targetScreen.y);
    highLayer.visible = true;

    const missHit = engine.pick(targetScreen.x + 240, targetScreen.y - 170);
    const topExpected =
      topLayerHit?.type === "vector-feature" &&
      topLayerHit.feature.layer === "places-high" &&
      topLayerHit.feature.properties?.kind === "high-layer-target";
    const hiddenFallbackExpected =
      hiddenFallbackHit?.type === "vector-feature" &&
      hiddenFallbackHit.feature.layer === "places-low" &&
      hiddenFallbackHit.feature.properties?.kind === "low-layer-target";
    const allHitsExpected = topExpected && hiddenFallbackExpected ? 1 : 0;
    const missHitIsVectorFeature = missHit?.type === "vector-feature" ? 1 : 0;

    container.dataset.phase = "after-vector-layer-zindex-pick";
    container.dataset.topLayerHitKind =
      topLayerHit?.type === "vector-feature" ? String(topLayerHit.feature.properties?.kind ?? "none") : "none";
    container.dataset.topLayerHitLayer =
      topLayerHit?.type === "vector-feature" ? topLayerHit.feature.layer : "none";
    container.dataset.hiddenFallbackHitKind =
      hiddenFallbackHit?.type === "vector-feature"
        ? String(hiddenFallbackHit.feature.properties?.kind ?? "none")
        : "none";
    container.dataset.hiddenFallbackHitLayer =
      hiddenFallbackHit?.type === "vector-feature" ? hiddenFallbackHit.feature.layer : "none";
    container.dataset.allHitsExpected = `${allHitsExpected}`;
    container.dataset.missHitIsVectorFeature = `${missHitIsVectorFeature}`;
    output.textContent =
      `after-vector-layer-zindex-pick:all=${allHitsExpected}:` +
      `miss-vector=${missHitIsVectorFeature}`;
  };

  engine.addLayer(lowLayer);
  engine.addLayer(highLayer);
  engine.setView({ lng: 0, lat: 0, altitude: 2.2 });
  window.setTimeout(finalize, 100);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorLayerZIndexPickRegression?: {
          engine: GlobeEngine;
          lowLayer: VectorTileLayer;
          highLayer: VectorTileLayer;
        };
      }
    ).__vectorLayerZIndexPickRegression = {
      engine,
      lowLayer,
      highLayer
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
      <div class="demo-status" id="status-output">启动中:vector-layer-zindex-pick-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorLayerZIndexPickRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
