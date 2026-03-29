import "../src/styles.css";
import Pbf from "pbf";
import { GlobeEngine, VectorTileLayer } from "../src";

interface FixtureFeature {
  id: number;
  type: number;
  tags?: number[];
  geometry: number[];
}

interface FixtureLayer {
  name: string;
  keys?: string[];
  values?: string[];
  features: FixtureFeature[];
  extent?: number;
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function encodeSigned(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}

function moveTo(points: Array<[number, number]>): number[] {
  const geometry = [(points.length << 3) | 1];
  let previousX = 0;
  let previousY = 0;

  for (const [x, y] of points) {
    geometry.push(encodeSigned(x - previousX), encodeSigned(y - previousY));
    previousX = x;
    previousY = y;
  }

  return geometry;
}

function lineTo(points: Array<[number, number]>, start: [number, number]): number[] {
  const geometry = [(points.length << 3) | 2];
  let [previousX, previousY] = start;

  for (const [x, y] of points) {
    geometry.push(encodeSigned(x - previousX), encodeSigned(y - previousY));
    previousX = x;
    previousY = y;
  }

  return geometry;
}

function writeValue(value: string, pbf: Pbf): void {
  pbf.writeStringField(1, value);
}

function writeFeature(feature: FixtureFeature, pbf: Pbf): void {
  pbf.writeVarintField(1, feature.id);

  if (feature.tags && feature.tags.length > 0) {
    pbf.writePackedVarint(2, feature.tags);
  }

  pbf.writeVarintField(3, feature.type);
  pbf.writePackedVarint(4, feature.geometry);
}

function writeLayer(layer: FixtureLayer, pbf: Pbf): void {
  pbf.writeStringField(1, layer.name);

  for (const feature of layer.features) {
    pbf.writeMessage(2, writeFeature, feature);
  }

  for (const key of layer.keys ?? []) {
    pbf.writeStringField(3, key);
  }

  for (const value of layer.values ?? []) {
    pbf.writeMessage(4, writeValue, value);
  }

  pbf.writeVarintField(5, layer.extent ?? 4096);
  pbf.writeVarintField(15, 2);
}

function createVectorTileFixture(): Uint8Array {
  const layers: FixtureLayer[] = [
    {
      name: "places",
      keys: ["kind"],
      values: ["capital"],
      features: [
        {
          id: 1,
          type: 1,
          tags: [0, 0],
          geometry: moveTo([[2048, 2048]])
        }
      ]
    },
    {
      name: "roads",
      keys: ["kind"],
      values: ["arterial"],
      features: [
        {
          id: 2,
          type: 2,
          tags: [0, 0],
          geometry: [
            ...moveTo([[0, 0]]),
            ...lineTo([[4096, 4096]], [0, 0])
          ]
        }
      ]
    },
    {
      name: "landuse",
      keys: ["kind"],
      values: ["park"],
      features: [
        {
          id: 3,
          type: 3,
          tags: [0, 0],
          geometry: [
            ...moveTo([[0, 0]]),
            ...lineTo([[4096, 0], [4096, 4096], [0, 4096]], [0, 0]),
            15
          ]
        }
      ]
    }
  ];
  const pbf = new Pbf();

  for (const layer of layers) {
    pbf.writeMessage(3, writeLayer, layer);
  }

  return pbf.finish();
}

export function runVectorTileRegression(container: HTMLElement, output: HTMLElement): GlobeEngine {
  setStageSize(container, 960, 540);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#021019"
  });
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf",
    style: {
      places: { pointColor: "#ffcc66", pointSize: 0.02 },
      roads: { strokeColor: "#e3f2fd" },
      landuse: { fillColor: "#4ade80", opacity: 0.62 }
    }
  });

  container.dataset.phase = "booting";
  container.dataset.pointCount = "";
  container.dataset.lineCount = "";
  container.dataset.polygonCount = "";
  container.dataset.objectCount = "";
  output.textContent = "booting:vector-tile-regression";

  engine.addLayer(vectorLayer);
  engine.setView({ lng: 0, lat: 20, altitude: 2.4 });

  void vectorLayer.setTileData(createVectorTileFixture(), 0, 0, 0)
    .then((features) => {
      const pointCount = features.filter((feature) => feature.type === "point").length;
      const lineCount = features.filter((feature) => feature.type === "line").length;
      const polygonCount = features.filter((feature) => feature.type === "polygon").length;
      const objectCount =
        engine.sceneSystem.scene.getObjectByName(vectorLayer.id)?.children.length ?? 0;

      engine.render();
      container.dataset.phase = "after-vector";
      container.dataset.pointCount = `${pointCount}`;
      container.dataset.lineCount = `${lineCount}`;
      container.dataset.polygonCount = `${polygonCount}`;
      container.dataset.objectCount = `${objectCount}`;
      output.textContent = `after-vector:p${pointCount}-l${lineCount}-g${polygonCount}-o${objectCount}`;
    })
    .catch((error) => {
      container.dataset.phase = "error";
      output.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
    });

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __vectorTileRegression?: {
          engine: GlobeEngine;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__vectorTileRegression = {
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
      <div class="demo-status" id="status-output">booting:vector-tile-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runVectorTileRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
