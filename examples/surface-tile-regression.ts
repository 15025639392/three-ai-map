import "../src/styles.css";
import { GlobeEngine, SurfaceTileLayer } from "../src";
import type { ElevationTileData } from "../src/layers/SurfaceTileLayer";
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
  let selectedTiles: TileCoordinate[] = [{ z: 2, x: 2, y: 1 }];
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });
  const surfaceTiles = new SurfaceTileLayer("surface-tile-regression", {
    minZoom: 1,
    maxZoom: 6,
    meshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0,
    selectTiles: () => ({
      zoom: 2,
      coordinates: selectedTiles,
    }),
    loadImageryTile: async (coordinate) => createImageryTile(coordinate),
    loadElevationTile: async () => createFlatElevationTile(),
  });

  const syncStatus = (phase: string): void => {
    const activeTiles = surfaceTiles.getActiveTileKeys().join(",");
    container.dataset.phase = phase;
    container.dataset.activeTiles = activeTiles;
    container.dataset.surfaceTiles = "ready";
    output.textContent = `${phase}:${activeTiles || "none"}`;
  };

  container.dataset.phase = "booting";
  container.dataset.surfaceTiles = "loading";
  container.dataset.activeTiles = "";
  output.textContent = "booting:surface-tile-regression";

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 0, lat: 20, altitude: 2.4 });

  void surfaceTiles
    .ready()
    .then(() => {
      syncStatus("initial");

      window.setTimeout(() => {
        selectedTiles = [{ z: 2, x: 3, y: 1 }];
        container.dataset.phase = "switching";
        engine.render();

        void surfaceTiles
          .ready()
          .then(() => {
            syncStatus("after-switch");
          })
          .catch((error: unknown) => {
            container.dataset.phase = "error";
            container.dataset.surfaceTiles = "error";
            output.textContent =
              error instanceof Error ? `error:${error.message}` : "error:unknown";
          });
      }, 150);
    })
    .catch((error: unknown) => {
      container.dataset.phase = "error";
      container.dataset.surfaceTiles = "error";
      output.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
    });

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileRegression?: { engine: GlobeEngine; surfaceTiles: SurfaceTileLayer };
      }
    ).__surfaceTileRegression = {
      engine,
      surfaceTiles,
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
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">booting:surface-tile-regression</div>
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
