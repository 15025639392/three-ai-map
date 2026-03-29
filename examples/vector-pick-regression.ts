import "../src/styles.css";
import { GlobeEngine, VectorTileLayer } from "../src";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

export function runVectorPickRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.centerHitType = "";
  container.dataset.centerFeatureLayer = "";
  container.dataset.centerFeatureType = "";
  container.dataset.centerFeatureKind = "";
  container.dataset.centerHitIsExpected = "";
  container.dataset.missHitType = "";
  container.dataset.missHitIsVectorFeature = "";
  output.textContent = "booting:vector-pick-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#050f19"
  });
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      places: {
        pointSize: 0.05,
        pointColor: "#ffd46b"
      }
    }
  });

  vectorLayer.setFeatures([
    {
      type: "point",
      layer: "places",
      geometry: [[[0, 0]]],
      properties: {
        kind: "center-point"
      }
    }
  ]);

  const finalize = (): void => {
    engine.render();
    const rect = container.getBoundingClientRect();
    const centerHit = engine.pick(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const missHit = engine.pick(rect.left + 20, rect.top + 20);
    const centerFeatureLayer =
      centerHit && centerHit.type === "vector-feature" ? centerHit.feature.layer : "none";
    const centerFeatureType =
      centerHit && centerHit.type === "vector-feature" ? centerHit.feature.type : "none";
    const centerFeatureKind =
      centerHit && centerHit.type === "vector-feature"
        ? String(centerHit.feature.properties?.kind ?? "none")
        : "none";
    const centerHitIsExpected =
      centerHit?.type === "vector-feature" &&
      centerFeatureLayer === "places" &&
      centerFeatureType === "point" &&
      centerFeatureKind === "center-point"
        ? 1
        : 0;
    const missHitIsVectorFeature = missHit?.type === "vector-feature" ? 1 : 0;

    container.dataset.phase = "after-vector-pick";
    container.dataset.centerHitType = centerHit?.type ?? "none";
    container.dataset.centerFeatureLayer = centerFeatureLayer;
    container.dataset.centerFeatureType = centerFeatureType;
    container.dataset.centerFeatureKind = centerFeatureKind;
    container.dataset.centerHitIsExpected = `${centerHitIsExpected}`;
    container.dataset.missHitType = missHit?.type ?? "none";
    container.dataset.missHitIsVectorFeature = `${missHitIsVectorFeature}`;
    output.textContent =
      `after-vector-pick:center=${container.dataset.centerHitType}:` +
      `miss=${container.dataset.missHitType}`;
  };

  engine.addLayer(vectorLayer);
  engine.setView({ lng: 0, lat: 0, altitude: 2 });
  window.setTimeout(finalize, 80);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorPickRegression?: {
          engine: GlobeEngine;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__vectorPickRegression = {
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
      <a class="back-link" href="/">Back to Demos</a>
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">booting:vector-pick-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorPickRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
