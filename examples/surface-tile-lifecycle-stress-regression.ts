import "../src/styles.css";
import { GlobeEngine, SurfaceTileLayer } from "../src";
import type { ElevationTileData } from "../src/layers/SurfaceTileLayer";
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
    throw new Error("Missing 2D canvas context for lifecycle stress tile");
  }

  const hue = (coordinate.x * 37 + coordinate.y * 43 + coordinate.z * 71) % 360;
  context.fillStyle = `hsl(${hue} 70% 44%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255, 255, 255, 0.44)";
  context.lineWidth = 8;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  context.fillStyle = "#ffffff";
  context.font = "bold 22px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 20, 40);
  return canvas;
}

function createElevationTile(coordinate: TileCoordinate): ElevationTileData {
  const width = 4;
  const height = 4;
  const data = new Float32Array(width * height);
  const base = 100 + coordinate.z * 12 + coordinate.x * 2 + coordinate.y * 4;
  data.fill(base);
  return {
    width,
    height,
    data
  };
}

function createSurfaceLayer(layerId: string): SurfaceTileLayer {
  return new SurfaceTileLayer(layerId, {
    minZoom: 2,
    maxZoom: 6,
    tileSize: 128,
    meshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0,
    selectTiles: () => ({
      zoom: 2,
      coordinates: [
        { z: 2, x: 2, y: 1 },
        { z: 2, x: 3, y: 1 }
      ]
    }),
    loadImageryTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(10 + ((coordinate.x + coordinate.y) % 2) * 8, () => createImageryTile(coordinate), signal),
    loadElevationTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(6, () => createElevationTile(coordinate), signal)
  });
}

export function runSurfaceTileLifecycleStressRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);

  const cycleCount = 3;
  const expectedTileKeys = "2/2/1,2/3/1";
  const layerId = "surface-tile-lifecycle-stress-regression";
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });

  const sceneObjectCounts: number[] = [];
  let tileKeysRestoredCount = 0;
  let removeClearedCount = 0;
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
    output.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
  };

  const finalize = (): void => {
    frameLoopStopped = true;
    const sceneObjectCountMin = sceneObjectCounts.length > 0
      ? Math.min(...sceneObjectCounts)
      : 0;
    const sceneObjectCountMax = sceneObjectCounts.length > 0
      ? Math.max(...sceneObjectCounts)
      : 0;
    const stableSceneObjectCount = sceneObjectCountMin === sceneObjectCountMax ? 1 : 0;
    const allExpected =
      tileKeysRestoredCount === cycleCount &&
      removeClearedCount === cycleCount &&
      stableSceneObjectCount === 1
        ? 1
        : 0;

    container.dataset.phase = "after-surface-lifecycle-stress";
    container.dataset.expectedTileKeys = expectedTileKeys;
    container.dataset.cycleCount = `${cycleCount}`;
    container.dataset.tileKeysRestoredCount = `${tileKeysRestoredCount}`;
    container.dataset.removeClearedCount = `${removeClearedCount}`;
    container.dataset.sceneObjectCountMin = `${sceneObjectCountMin}`;
    container.dataset.sceneObjectCountMax = `${sceneObjectCountMax}`;
    container.dataset.stableSceneObjectCount = `${stableSceneObjectCount}`;
    container.dataset.allExpected = `${allExpected}`;
    output.textContent = `after-surface-lifecycle-stress:keys=${tileKeysRestoredCount}/${cycleCount}:remove=${removeClearedCount}/${cycleCount}:stable=${stableSceneObjectCount}`;
  };

  const runScenario = async (): Promise<void> => {
    for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
      const layer = createSurfaceLayer(layerId);
      engine.addLayer(layer);
      engine.setView({ lng: 8, lat: 26, altitude: 2.3 });
      await layer.ready();

      const keys = layer.getActiveTileKeys().join(",");
      if (keys === expectedTileKeys) {
        tileKeysRestoredCount += 1;
      }
      engine.render();
      const sceneObjectCount = engine.getPerformanceReport().metrics.get("sceneObjectCount")?.value ?? 0;
      sceneObjectCounts.push(sceneObjectCount);

      engine.removeLayer(layerId);
      const removeCleared = layer.getDebugStats().activeTileCount === 0 &&
        !engine.sceneSystem.scene.getObjectByName(layerId) &&
        engine.globe.mesh.visible;
      if (removeCleared) {
        removeClearedCount += 1;
      }

      container.dataset.phase = `cycle-${cycle}-done`;
      output.textContent = `cycle-${cycle}/${cycleCount}:keys=${keys || "none"}:remove=${removeCleared ? 1 : 0}`;
      await delayValue(30, () => undefined);
    }
  };

  container.dataset.phase = "booting";
  container.dataset.expectedTileKeys = expectedTileKeys;
  container.dataset.cycleCount = `${cycleCount}`;
  container.dataset.tileKeysRestoredCount = "";
  container.dataset.removeClearedCount = "";
  container.dataset.sceneObjectCountMin = "";
  container.dataset.sceneObjectCountMax = "";
  container.dataset.stableSceneObjectCount = "";
  container.dataset.allExpected = "";
  output.textContent = "booting:surface-tile-lifecycle-stress-regression";
  window.requestAnimationFrame(frameLoop);

  void runScenario()
    .then(() => {
      window.setTimeout(finalize, 80);
    })
    .catch(handleError);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileLifecycleStressRegression?: {
          engine: GlobeEngine;
        };
      }
    ).__surfaceTileLifecycleStressRegression = {
      engine
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
      <div class="demo-status" id="status-output">booting:surface-tile-lifecycle-stress-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileLifecycleStressRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
