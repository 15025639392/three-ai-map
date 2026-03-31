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
    throw new Error("Missing 2D canvas context for regression tile");
  }

  context.fillStyle = coordinate.x === 2 ? "#2563eb" : "#dc2626";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.45)";
  context.lineWidth = 10;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  context.fillStyle = "#ffffff";
  context.font = "bold 28px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 26, 54);

  return canvas;
}

export function runSurfaceTileRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });
  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 1,
      maxZoom: 6,
      tileSize: 256,
      cache: 16,
    },
    meshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0,
    loadElevationTile: async () => createFlatElevationTile(),
  });

  const syncStatus = (phase: string): void => {
    const activeTiles = terrain.getActiveTileKeys().join(",");
    container.dataset.phase = phase;
    container.dataset.activeTiles = activeTiles;
    container.dataset.surfaceTiles = "ready";
    output.textContent = `${phase}:${activeTiles || "none"}`;
  };

  container.dataset.phase = "booting";
  container.dataset.surfaceTiles = "loading";
  container.dataset.activeTiles = "";
  output.textContent = "启动中:surface-tile-regression";

  const rasterSource = new RasterTileSource("raster", {
    tiles: ["memory://{z}/{x}/{y}.png"],
    cache: 16,
    concurrency: 2,
    loadTile: async (coordinate) => createImageryTile(coordinate),
  });
  engine.addSource("raster", rasterSource);
  const rasterLayer = new RasterLayer({ id: "raster-layer", source: "raster" });

  engine.addLayer(terrain);
  engine.addLayer(rasterLayer);
  engine.setView({ lng: 0, lat: 20, altitude: 2.4 });

  void terrain
    .ready()
    .then(() => {
      syncStatus("initial");

      window.setTimeout(() => {
        container.dataset.phase = "switching";
        engine.setView({ lng: 25, lat: 20, altitude: 2.4 });
        window.setTimeout(() => {
          syncStatus("after-switch");
        }, 250);
      }, 150);
    })
    .catch((error: unknown) => {
      container.dataset.phase = "error";
      container.dataset.surfaceTiles = "error";
      output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
    });

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileRegression?: { engine: GlobeEngine; terrain: TerrainTileLayer; raster: RasterLayer };
      }
    ).__surfaceTileRegression = {
      engine,
      terrain,
      raster: rasterLayer,
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
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">启动中:surface-tile-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
