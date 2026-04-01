import "../src/styles.css";
import { GlobeEngine, TerrainTileLayer, TerrainTileSource, RasterLayer, RasterTileSource } from "../src";
import type { ElevationTileData } from "../src";
import type { TileCoordinate } from "../src/tiles/TileViewport";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function createAbortError(signal: AbortSignal | undefined, fallbackMessage: string): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  const message = typeof signal?.reason === "string" ? signal.reason : fallbackMessage;
  if (typeof DOMException === "function") {
    return new DOMException(message, "AbortError");
  }

  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function delayValue<T>(
  delayMs: number,
  createValue: () => T,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal, "Regression load aborted"));
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(createValue());
    }, delayMs);
    const abortHandler = () => {
      cleanup();
      window.clearTimeout(timeoutId);
      reject(createAbortError(signal, "Regression load aborted"));
    };
    const cleanup = () => {
      signal?.removeEventListener("abort", abortHandler);
    };

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
}

function createImageryTile(coordinate: TileCoordinate): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Missing 2D canvas context for lifecycle regression tile");
  }

  const hue = (coordinate.x * 33 + coordinate.y * 51 + coordinate.z * 67) % 360;
  context.fillStyle = `hsl(${hue} 70% 46%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255, 255, 255, 0.48)";
  context.lineWidth = 10;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  context.fillStyle = "#ffffff";
  context.font = "bold 24px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 20, 40);
  return canvas;
}

function createElevationTile(coordinate: TileCoordinate): ElevationTileData {
  const width = 4;
  const height = 4;
  const data = new Float32Array(width * height);
  const value = 90 + coordinate.z * 10 + coordinate.x * 2 + coordinate.y * 3;
  data.fill(value);
  return { width, height, data };
}

function createTerrainLayer(layerId: string, sourceId: string): TerrainTileLayer {
  return new TerrainTileLayer(layerId, {
    source: sourceId,
    minMeshSegments: 2,
    maxMeshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0
  });
}

export function runSurfaceTileLifecycleRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);

  const layerId = "surface-tile-lifecycle-regression";
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const terrainSourceId = "lifecycle-terrain";
  const terrainSource = new TerrainTileSource(terrainSourceId, {
    tiles: ["memory://{z}/{x}/{y}.png"],
    encode: "terrarium",
    minZoom: 2,
    maxZoom: 6,
    tileSize: 128,
    cache: 64,
    concurrency: 4,
    loadTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(8, () => createElevationTile(coordinate), signal)
  });
  engine.addSource(terrainSourceId, terrainSource);

  const rasterSourceId = "lifecycle-raster";
  const rasterSource = new RasterTileSource(rasterSourceId, {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 128,
    cache: 64,
    concurrency: 4,
    loadTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(
        12 + ((coordinate.x + coordinate.y) % 2) * 8,
        () => createImageryTile(coordinate),
        signal
      )
  });
  engine.addSource(rasterSourceId, rasterSource);

  let activeTerrain = createTerrainLayer(layerId, terrainSourceId);
  const rasterLayer = new RasterLayer({ id: `${layerId}:raster`, source: rasterSourceId });
  let beforeTileKeys = "";
  let beforeTileCount = 0;
  let afterRemoveTileCount = 0;
  let afterRemoveGroupPresent = 1;
  let afterRemoveTerrainHostPresent = 1;
  let afterRemoveGlobeVisible = 1;
  let frameLoopStopped = false;

  const frameLoop = (): void => {
    if (frameLoopStopped) {
      return;
    }
    engine.render();
    window.requestAnimationFrame(frameLoop);
  };

  const handleError = (error: unknown): void => {
    frameLoopStopped = true;
    container.dataset.phase = "error";
    output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
  };

  const finalize = (): void => {
    frameLoopStopped = true;
    const afterReAddTileKeys = activeTerrain.getActiveTileKeys().join(",");
    const afterReAddTileCount = activeTerrain.getDebugStats().activeTileCount;
    const tileKeysRestored = beforeTileKeys === afterReAddTileKeys ? 1 : 0;
    const removeCleared = afterRemoveTileCount === 0 && afterRemoveGroupPresent === 0 ? 1 : 0;
    const allExpected =
      tileKeysRestored === 1 &&
      removeCleared === 1 &&
      afterRemoveTerrainHostPresent === 0 &&
      afterRemoveGlobeVisible === 1
        ? 1
        : 0;

    container.dataset.phase = "after-surface-lifecycle";
    container.dataset.beforeTileKeys = beforeTileKeys;
    container.dataset.beforeTileCount = `${beforeTileCount}`;
    container.dataset.afterRemoveTileCount = `${afterRemoveTileCount}`;
    container.dataset.afterRemoveGroupPresent = `${afterRemoveGroupPresent}`;
    container.dataset.afterRemoveGlobeVisible = `${afterRemoveGlobeVisible}`;
    container.dataset.afterRemoveTerrainHostPresent = `${afterRemoveTerrainHostPresent}`;
    container.dataset.afterReAddTileKeys = afterReAddTileKeys;
    container.dataset.afterReAddTileCount = `${afterReAddTileCount}`;
    container.dataset.tileKeysRestored = `${tileKeysRestored}`;
    container.dataset.removeCleared = `${removeCleared}`;
    container.dataset.allExpected = `${allExpected}`;
    output.textContent = `after-surface-lifecycle:${afterReAddTileKeys || "none"}:all=${allExpected}`;
  };

  container.dataset.phase = "booting";
  container.dataset.beforeTileKeys = "";
  container.dataset.beforeTileCount = "";
  container.dataset.afterRemoveTileCount = "";
  container.dataset.afterRemoveGroupPresent = "";
  container.dataset.afterRemoveGlobeVisible = "";
  container.dataset.afterRemoveTerrainHostPresent = "";
  container.dataset.afterReAddTileKeys = "";
  container.dataset.afterReAddTileCount = "";
  container.dataset.tileKeysRestored = "";
  container.dataset.removeCleared = "";
  container.dataset.allExpected = "";
  output.textContent = "启动中:surface-tile-lifecycle-regression";

  engine.addLayer(activeTerrain);
  engine.addLayer(rasterLayer);
  engine.setView({ lng: 6, lat: 26, altitude: 2.3 });
  window.requestAnimationFrame(frameLoop);

  void activeTerrain.ready()
    .then(() => {
      beforeTileKeys = activeTerrain.getActiveTileKeys().join(",");
      beforeTileCount = activeTerrain.getDebugStats().activeTileCount;
      container.dataset.phase = "before-remove";
      output.textContent = `before-remove:${beforeTileKeys || "none"}`;

      engine.removeLayer(layerId);
      afterRemoveTileCount = activeTerrain.getDebugStats().activeTileCount;
      afterRemoveGroupPresent = engine.sceneSystem.scene.getObjectByName(layerId) ? 1 : 0;
      afterRemoveTerrainHostPresent = engine.sceneSystem.scene.getObjectByName(layerId) ? 1 : 0;
      afterRemoveGlobeVisible = engine.globe.mesh.parent ? 1 : 0;
      container.dataset.phase = "after-remove";
      output.textContent = `after-remove:tiles=${afterRemoveTileCount}:group=${afterRemoveGroupPresent}`;

      window.setTimeout(() => {
        activeTerrain = createTerrainLayer(layerId, terrainSourceId);
        engine.addLayer(activeTerrain);
        container.dataset.phase = "after-readd";
        output.textContent = "after-readd:loading";

        void activeTerrain.ready()
          .then(() => {
            window.setTimeout(finalize, 120);
          })
          .catch(handleError);
      }, 48);
    })
    .catch(handleError);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileLifecycleRegression?: {
          engine: GlobeEngine;
          getLayer: () => TerrainTileLayer;
        };
      }
    ).__surfaceTileLifecycleRegression = {
      engine,
      getLayer: () => activeTerrain
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
      <div class="demo-status" id="status-output">启动中:surface-tile-lifecycle-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileLifecycleRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
