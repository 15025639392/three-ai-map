import "../src/styles.css";
import { GlobeEngine, TerrainTileLayer, TerrainTileSource, RasterLayer, RasterTileSource } from "../src";
import type { ElevationTileData } from "../src";
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
    throw new Error("Missing 2D canvas context for zoom regression tile");
  }

  const hue = (coordinate.x * 29 + coordinate.y * 47 + coordinate.z * 61) % 360;
  context.fillStyle = `hsl(${hue} 72% 46%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.42)";
  context.lineWidth = 10;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  context.fillStyle = "#ffffff";
  context.font = "bold 24px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 20, 40);

  return canvas;
}

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

function navigateToSmokeResultPage(metrics: {
  phase: string;
  fillEdgeCount: number;
  fillCornerCount: number;
  maxNeighborLodDelta: number;
  crackDetectedCount: number;
}): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>surface-tile-zoom-smoke</title></head><body data-phase="${metrics.phase}" data-fill-edge-count="${metrics.fillEdgeCount}" data-fill-corner-count="${metrics.fillCornerCount}" data-max-neighbor-lod-delta="${metrics.maxNeighborLodDelta}" data-crack-detected-count="${metrics.crackDetectedCount}">surface-tile-zoom-smoke</body></html>`;
  window.location.replace(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function waitForSmokeMetrics(
  terrain: TerrainTileLayer,
  timeoutMs: number
): Promise<void> {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const stats = terrain.getDebugStats();
      if (
        stats.activeTileCount > 0 &&
        stats.fillEdgeCount > 0 &&
        stats.maxNeighborLodDelta >= 1 &&
        stats.crackDetectedCount >= 1
      ) {
        resolve();
        return;
      }

      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("Smoke metrics did not converge before timeout"));
        return;
      }

      window.setTimeout(tick, 16);
    };

    tick();
  });
}

export function runSurfaceTileZoomRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const smokeMode = search?.get("smoke") === "1";
  const terrainDelayMs = smokeMode ? 2 : 18;
  const imageryDelayBaseMs = smokeMode ? 3 : 28;
  const imageryDelayStepMs = smokeMode ? 2 : 14;
  const preZoomDelayMs = smokeMode ? 40 : 140;
  const midZoomDelayMs = smokeMode ? 10 : 20;
  const finalizeDelayMs = smokeMode ? 40 : 180;

  setStageSize(container, 960, 540);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611",
  });
  const terrainSourceId = "terrain-source";
  const terrainSource = new TerrainTileSource(terrainSourceId, {
    tiles: ["memory://{z}/{x}/{y}.png"],
    encode: "terrarium",
    minZoom: 2,
    maxZoom: 9,
    tileSize: 128,
    cache: 64,
    concurrency: 4,
    loadTile: async (_coordinate, signal?: AbortSignal) =>
      delayValue(terrainDelayMs, () => createFlatElevationTile(), signal)
  });
  engine.addSource(terrainSourceId, terrainSource);
  const terrain = new TerrainTileLayer("terrain", {
    source: terrainSourceId,
    minMeshSegments: 2,
    maxMeshSegments: 2,
    skirtDepthMeters: 0,
    elevationExaggeration: 0
  });
  const rasterSource = new RasterTileSource("raster", {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 128,
    cache: 64,
    concurrency: 4,
    loadTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(
        imageryDelayBaseMs + ((coordinate.x + coordinate.y + coordinate.z) % 3) * imageryDelayStepMs,
        () => createImageryTile(coordinate),
        signal
      ),
  });
  engine.addSource("raster", rasterSource);
  const rasterLayer = new RasterLayer({ id: "raster-layer", source: "raster" });

  let beforeTiles = "";
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
    if (smokeMode) {
      engine.dispose();
      navigateToSmokeResultPage({
        phase: "error",
        fillEdgeCount: 0,
        fillCornerCount: 0,
        maxNeighborLodDelta: 0,
        crackDetectedCount: 0
      });
    }
  };

  const finalize = (): void => {
    frameLoopStopped = true;
    const report = engine.getPerformanceReport();
    const terrainStats = terrain.getDebugStats();
    const rasterStats = rasterSource.getStats();
    const averageFPS = Number(report.averageFPS.toFixed(2));
    const latestFrameTime = Number(report.frameTime.toFixed(2));
    const imageryCancelRatio = rasterStats.requested > 0
      ? Number((rasterStats.cancelled / rasterStats.requested).toFixed(4))
      : 0;
    const recoveryPolicyQueryCount =
      report.metrics.get("recoveryPolicyQueryCount")?.value ?? 0;
    const recoveryPolicyHitCount =
      report.metrics.get("recoveryPolicyHitCount")?.value ?? 0;
    const recoveryPolicyRuleHitCount =
      report.metrics.get("recoveryPolicyRuleHitCount")?.value ?? 0;
    const recoveryPolicyImageryQueryCount =
      report.metrics.get("recoveryPolicyQueryCount:imagery")?.value ?? 0;
    const recoveryPolicyImageryHitCount =
      report.metrics.get("recoveryPolicyHitCount:imagery")?.value ?? 0;
    const recoveryPolicyImageryRuleHitCount =
      report.metrics.get("recoveryPolicyRuleHitCount:imagery")?.value ?? 0;
    const fillEdgeCount = terrainStats.fillEdgeCount;
    const fillCornerCount = terrainStats.fillCornerCount;
    const maxNeighborLodDelta = terrainStats.maxNeighborLodDelta;
    const crackDetectedCount = terrainStats.crackDetectedCount;

    container.dataset.phase = "after-zoom";
    container.dataset.averageFps = `${averageFPS}`;
    container.dataset.frameTime = `${latestFrameTime}`;
    container.dataset.frameDrops = `${report.frameDrops}`;
    container.dataset.usedJsHeapSize = `${report.memory?.usedJSHeapSize ?? "na"}`;
    container.dataset.imageryRequested = `${rasterStats.requested}`;
    container.dataset.imageryCancelled = `${rasterStats.cancelled}`;
    container.dataset.elevationRequested = `${terrainStats.elevation.requested}`;
    container.dataset.elevationCancelled = `${terrainStats.elevation.cancelled}`;
    container.dataset.imageryCancelRatio = `${imageryCancelRatio}`;
    container.dataset.recoveryPolicyQueryCount = `${recoveryPolicyQueryCount}`;
    container.dataset.recoveryPolicyHitCount = `${recoveryPolicyHitCount}`;
    container.dataset.recoveryPolicyRuleHitCount = `${recoveryPolicyRuleHitCount}`;
    container.dataset.recoveryPolicyImageryQueryCount = `${recoveryPolicyImageryQueryCount}`;
    container.dataset.recoveryPolicyImageryHitCount = `${recoveryPolicyImageryHitCount}`;
    container.dataset.recoveryPolicyImageryRuleHitCount = `${recoveryPolicyImageryRuleHitCount}`;
    container.dataset.fillEdgeCount = `${fillEdgeCount}`;
    container.dataset.fillCornerCount = `${fillCornerCount}`;
    container.dataset.maxNeighborLodDelta = `${maxNeighborLodDelta}`;
    container.dataset.crackDetectedCount = `${crackDetectedCount}`;
    output.textContent = `after-zoom:${container.dataset.afterTiles || "none"}:fps=${averageFPS}:cancel=${imageryCancelRatio}:crack=${crackDetectedCount}`;
    if (smokeMode) {
      engine.dispose();
      navigateToSmokeResultPage({
        phase: "after-zoom",
        fillEdgeCount,
        fillCornerCount,
        maxNeighborLodDelta,
        crackDetectedCount
      });
    }
  };

  container.dataset.phase = "booting";
  container.dataset.beforeTiles = "";
  container.dataset.afterTiles = "";
  container.dataset.averageFps = "";
  container.dataset.frameTime = "";
  container.dataset.frameDrops = "";
  container.dataset.usedJsHeapSize = "";
  container.dataset.imageryRequested = "";
  container.dataset.imageryCancelled = "";
  container.dataset.elevationRequested = "";
  container.dataset.elevationCancelled = "";
  container.dataset.imageryCancelRatio = "";
  container.dataset.recoveryPolicyQueryCount = "";
  container.dataset.recoveryPolicyHitCount = "";
  container.dataset.recoveryPolicyRuleHitCount = "";
  container.dataset.recoveryPolicyImageryQueryCount = "";
  container.dataset.recoveryPolicyImageryHitCount = "";
  container.dataset.recoveryPolicyImageryRuleHitCount = "";
  container.dataset.fillEdgeCount = "";
  container.dataset.fillCornerCount = "";
  container.dataset.maxNeighborLodDelta = "";
  container.dataset.crackDetectedCount = "";
  output.textContent = "启动中:surface-tile-zoom-regression";

  window.requestAnimationFrame(frameLoop);

  engine.addLayer(terrain);
  engine.addLayer(rasterLayer);
  engine.setView({ lng: 8, lat: 28, altitude: 2.8 });

  if (smokeMode) {
    window.setTimeout(() => {
      beforeTiles = terrain.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      container.dataset.phase = "before-zoom";
      output.textContent = `before-zoom:${beforeTiles || "none"}`;
      container.dataset.phase = "zooming";
      engine.setView({ lng: 8, lat: 28, altitude: 1.75 });

      window.setTimeout(() => {
        engine.setView({ lng: 8, lat: 28, altitude: 1.1 });
        waitForSmokeMetrics(terrain, 6000)
          .then(() => {
            container.dataset.afterTiles = terrain.getActiveTileKeys().join(",");
            output.textContent = `settling:${container.dataset.afterTiles || "none"}`;
            window.setTimeout(finalize, finalizeDelayMs);
          })
          .catch(handleError);
      }, midZoomDelayMs);
    }, preZoomDelayMs);

    if (typeof window !== "undefined") {
      (
        window as Window & {
          __surfaceTileZoomRegression?: {
            engine: GlobeEngine;
            terrain: TerrainTileLayer;
            raster: RasterLayer;
          };
        }
      ).__surfaceTileZoomRegression = {
        engine,
        terrain,
        raster: rasterLayer,
      };
    }

    return engine;
  }

  void terrain.ready()
    .then(() => {
      beforeTiles = terrain.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      container.dataset.phase = "before-zoom";
      output.textContent = `before-zoom:${beforeTiles || "none"}`;

      window.setTimeout(() => {
        container.dataset.phase = "zooming";
        engine.setView({ lng: 8, lat: 28, altitude: 1.75 });

        window.setTimeout(() => {
          engine.setView({ lng: 8, lat: 28, altitude: 1.1 });

          void terrain.ready()
            .then(() => {
              container.dataset.afterTiles = terrain.getActiveTileKeys().join(",");
              output.textContent = `settling:${container.dataset.afterTiles || "none"}`;
              window.setTimeout(finalize, finalizeDelayMs);
            })
            .catch(handleError);
        }, midZoomDelayMs);
      }, preZoomDelayMs);
    })
    .catch(handleError);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileZoomRegression?: {
          engine: GlobeEngine;
          terrain: TerrainTileLayer;
          raster: RasterLayer;
        };
      }
    ).__surfaceTileZoomRegression = {
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
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">启动中:surface-tile-zoom-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileZoomRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
