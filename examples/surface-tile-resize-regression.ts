import "../src/styles.css";
import { GlobeEngine, TerrainTileLayer, RasterLayer, RasterTileSource } from "../src";
import type { ElevationTileData } from "../src/layers/TerrainTileLayer";
import type { TileCoordinate } from "../src/tiles/TileViewport";

function createFlatElevationTile(): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 0, 0]),
  };
}

function createImageryTile(coordinate: TileCoordinate): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Missing 2D canvas context for resize regression tile");
  }

  const hue = (coordinate.x * 37 + coordinate.y * 53 + coordinate.z * 17) % 360;
  context.fillStyle = `hsl(${hue} 72% 48%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.font = "bold 24px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 20, 42);

  context.strokeStyle = "rgba(255, 255, 255, 0.42)";
  context.lineWidth = 8;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  return canvas;
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

export function runSurfaceTileResizeRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 420, 240);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });
  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 10,
      tileSize: 128,
      cache: 32,
    },
    meshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0,
    loadElevationTile: async () => createFlatElevationTile(),
  });
  const rasterSource = new RasterTileSource("raster", {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 128,
    cache: 32,
    concurrency: 2,
    loadTile: async (coordinate) => createImageryTile(coordinate),
  });
  engine.addSource("raster", rasterSource);
  const rasterLayer = new RasterLayer({ id: "raster-layer", source: "raster" });

  container.dataset.phase = "booting";
  container.dataset.beforeTiles = "";
  container.dataset.afterTiles = "";
  output.textContent = "启动中:surface-tile-resize-regression";

  const syncStatus = (phase: string, tileKeys: string): void => {
    container.dataset.phase = phase;
    output.textContent = `${phase}:${tileKeys || "none"}`;
  };

  engine.addLayer(terrain);
  engine.addLayer(rasterLayer);
  engine.setView({ lng: 8, lat: 28, altitude: 1.7 });

  void terrain.ready()
    .then(() => {
      const beforeTiles = terrain.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      syncStatus("before-resize", beforeTiles);

      window.setTimeout(() => {
        setStageSize(container, 1120, 680);
        engine.resize();

        void terrain.ready()
          .then(() => {
            const afterTiles = terrain.getActiveTileKeys().join(",");
            container.dataset.afterTiles = afterTiles;
            syncStatus("after-resize", afterTiles);
          })
          .catch((error: unknown) => {
            container.dataset.phase = "error";
            output.textContent =
              error instanceof Error ? `错误:${error.message}` : "错误:未知";
          });
      }, 180);
    })
    .catch((error: unknown) => {
      container.dataset.phase = "error";
      output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
    });

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
      <div class="demo-status" id="status-output">启动中:surface-tile-resize-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileResizeRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
