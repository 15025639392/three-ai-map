import "../src/styles.css";
import { GlobeEngine, TerrainTileLayer, RasterLayer, RasterTileSource } from "../src";
import type { ElevationTileData } from "../src/layers/TerrainTileLayer";
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

function sleep(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function createImageryTile(coordinate: TileCoordinate): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Missing 2D canvas context for basic load-recovery tile");
  }

  const hue = (coordinate.x * 29 + coordinate.y * 41 + coordinate.z * 53) % 360;
  context.fillStyle = `hsl(${hue} 62% 40%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,0.45)";
  context.lineWidth = 8;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  context.fillStyle = "#ffffff";
  context.font = "bold 20px sans-serif";
  context.fillText(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, 18, 36);

  return canvas;
}

function createElevationTile(coordinate: TileCoordinate): ElevationTileData {
  const width = 4;
  const height = 4;
  const data = new Float32Array(width * height);
  const base = 120 + coordinate.z * 18 + coordinate.x * 4 + coordinate.y * 6;

  for (let index = 0; index < data.length; index += 1) {
    data[index] = base + (index % width) * 7;
  }

  return {
    width,
    height,
    data
  };
}

function selectDeterministicTiles({
  camera,
  radius
}: {
  camera: { position: { length: () => number; x: number } };
  radius: number;
}): { zoom: number; coordinates: TileCoordinate[] } {
  const altitude = camera.position.length() - radius;

  if (altitude > 2.25) {
    return {
      zoom: 2,
      coordinates: [
        { z: 2, x: 2, y: 1 },
        { z: 2, x: 3, y: 1 }
      ]
    };
  }

  if (altitude > 1.7) {
    return {
      zoom: 3,
      coordinates: [
        { z: 3, x: 4, y: 2 },
        { z: 3, x: 5, y: 2 },
        { z: 3, x: 4, y: 3 },
        { z: 3, x: 5, y: 3 }
      ]
    };
  }

  if (camera.position.x >= 0) {
    return {
      zoom: 4,
      coordinates: [
        { z: 4, x: 8, y: 4 },
        { z: 4, x: 9, y: 4 },
        { z: 4, x: 8, y: 5 },
        { z: 4, x: 9, y: 5 }
      ]
    };
  }

  return {
    zoom: 4,
    coordinates: [
      { z: 4, x: 6, y: 4 },
      { z: 4, x: 7, y: 4 },
      { z: 4, x: 6, y: 5 },
      { z: 4, x: 7, y: 5 }
    ]
  };
}

interface SurfaceStatsSnapshot {
  imageryRequested: number;
  imageryCancelled: number;
  elevationRequested: number;
  elevationCancelled: number;
}

interface ProfileMetrics {
  averageFPS: number;
  frameDrops: number;
  imageryRequested: number;
  imageryCancelled: number;
  elevationRequested: number;
  elevationCancelled: number;
  renderCount: number;
  layerCount: number;
  sceneObjectCount: number;
  cameraAltitude: number;
}

function snapshotSurfaceStats(
  terrain: TerrainTileLayer,
  rasterSource: RasterTileSource
): SurfaceStatsSnapshot {
  const terrainStats = terrain.getDebugStats();
  const rasterStats = rasterSource.getStats();
  return {
    imageryRequested: rasterStats.requested,
    imageryCancelled: rasterStats.cancelled,
    elevationRequested: terrainStats.elevation.requested,
    elevationCancelled: terrainStats.elevation.cancelled
  };
}

function collectProfileMetrics(
  engine: GlobeEngine,
  terrain: TerrainTileLayer,
  rasterSource: RasterTileSource,
  snapshotBefore: SurfaceStatsSnapshot
): ProfileMetrics {
  const report = engine.getPerformanceReport();
  const terrainStats = terrain.getDebugStats();
  const rasterStats = rasterSource.getStats();

  return {
    averageFPS: Number(Math.min(Math.max(report.averageFPS, 0), 1200).toFixed(2)),
    frameDrops: report.frameDrops,
    imageryRequested: rasterStats.requested - snapshotBefore.imageryRequested,
    imageryCancelled: rasterStats.cancelled - snapshotBefore.imageryCancelled,
    elevationRequested: terrainStats.elevation.requested - snapshotBefore.elevationRequested,
    elevationCancelled: terrainStats.elevation.cancelled - snapshotBefore.elevationCancelled,
    renderCount: report.metrics.get("renderCount")?.value ?? 0,
    layerCount: report.metrics.get("layerCount")?.value ?? 0,
    sceneObjectCount: report.metrics.get("sceneObjectCount")?.value ?? 0,
    cameraAltitude: report.metrics.get("cameraAltitude")?.value ?? 0
  };
}

async function runViewSequence(
  engine: GlobeEngine,
  sequence: Array<{ lng: number; lat: number; altitude: number; waitMs: number }>
): Promise<void> {
  for (const step of sequence) {
    engine.setView({
      lng: step.lng,
      lat: step.lat,
      altitude: step.altitude
    });
    await sleep(step.waitMs);
  }
}

function setDataAttribute(container: HTMLElement, key: string, value: string | number): void {
  container.dataset[key] = `${value}`;
}

function normalizedFpsRatio(left: number, right: number): number {
  if (left <= 0 || right <= 0) {
    return 0;
  }

  return Number((Math.min(left, right) / Math.max(left, right)).toFixed(4));
}

export function runBasicGlobeLoadRecoveryRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);

  const markerCount = 12;
  const polylineCount = 6;
  const polygonCount = 3;
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const terrain = new TerrainTileLayer("basic-globe-load-recovery-regression", {
    terrain: {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 2,
      maxZoom: 10,
      tileSize: 128,
      cache: 96,
    },
    minMeshSegments: 3,
    maxMeshSegments: 3,
    skirtDepthMeters: 900,
    elevationExaggeration: 1,
    zoomExaggerationBoost: 1.8,
    loadElevationTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(20, () => createElevationTile(coordinate), signal)
  });
  const rasterSourceId = "basic-recovery-imagery";
  const rasterSource = new RasterTileSource(rasterSourceId, {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 128,
    cache: 96,
    concurrency: 6,
    loadTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(
        30 + ((coordinate.x + coordinate.y + coordinate.z) % 4) * 20,
        () => createImageryTile(coordinate),
        signal
      )
  });
  engine.addSource(rasterSourceId, rasterSource);
  const rasterLayer = new RasterLayer({ id: "basic-recovery-imagery", source: rasterSourceId });

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

  const addHeavyOverlays = (): void => {
    const markers = [
      { id: "marker-shanghai", lng: 121.47, lat: 31.23 },
      { id: "marker-tokyo", lng: 139.69, lat: 35.69 },
      { id: "marker-newyork", lng: -74.0, lat: 40.71 },
      { id: "marker-london", lng: -0.12, lat: 51.51 },
      { id: "marker-sydney", lng: 151.21, lat: -33.87 },
      { id: "marker-singapore", lng: 103.82, lat: 1.35 },
      { id: "marker-dubai", lng: 55.27, lat: 25.2 },
      { id: "marker-cape-town", lng: 18.42, lat: -33.93 },
      { id: "marker-rio", lng: -43.2, lat: -22.91 },
      { id: "marker-los-angeles", lng: -118.24, lat: 34.05 },
      { id: "marker-mumbai", lng: 72.88, lat: 19.08 },
      { id: "marker-paris", lng: 2.35, lat: 48.86 }
    ];

    for (const marker of markers) {
      engine.addMarker({
        ...marker,
        altitude: 0.02,
        color: "#ffd166"
      });
    }

    engine.addPolyline({
      id: "route-east-west",
      coordinates: [
        { lng: 121.47, lat: 31.23, altitude: 0.01 },
        { lng: -74.0, lat: 40.71, altitude: 0.01 }
      ],
      color: "#8ed6ff"
    });
    engine.addPolyline({
      id: "route-europe-asia",
      coordinates: [
        { lng: -0.12, lat: 51.51, altitude: 0.01 },
        { lng: 139.69, lat: 35.69, altitude: 0.01 }
      ],
      color: "#c084fc"
    });
    engine.addPolyline({
      id: "route-south",
      coordinates: [
        { lng: 103.82, lat: 1.35, altitude: 0.01 },
        { lng: 18.42, lat: -33.93, altitude: 0.01 }
      ],
      color: "#ff8f70"
    });
    engine.addPolyline({
      id: "route-oceania",
      coordinates: [
        { lng: 151.21, lat: -33.87, altitude: 0.01 },
        { lng: 139.69, lat: 35.69, altitude: 0.01 }
      ],
      color: "#6ad8ff"
    });
    engine.addPolyline({
      id: "route-atlantic",
      coordinates: [
        { lng: -43.2, lat: -22.91, altitude: 0.01 },
        { lng: 2.35, lat: 48.86, altitude: 0.01 }
      ],
      color: "#f472b6"
    });
    engine.addPolyline({
      id: "route-asia",
      coordinates: [
        { lng: 72.88, lat: 19.08, altitude: 0.01 },
        { lng: 55.27, lat: 25.2, altitude: 0.01 }
      ],
      color: "#7dd3fc"
    });

    engine.addPolygon({
      id: "region-east-asia",
      coordinates: [
        { lng: 100, lat: 5, altitude: 0.005 },
        { lng: 145, lat: 5, altitude: 0.005 },
        { lng: 145, lat: 45, altitude: 0.005 },
        { lng: 100, lat: 45, altitude: 0.005 }
      ],
      fillColor: "#36d695",
      opacity: 0.35
    });
    engine.addPolygon({
      id: "region-europe",
      coordinates: [
        { lng: -10, lat: 34, altitude: 0.005 },
        { lng: 35, lat: 34, altitude: 0.005 },
        { lng: 35, lat: 60, altitude: 0.005 },
        { lng: -10, lat: 60, altitude: 0.005 }
      ],
      fillColor: "#f8d66d",
      opacity: 0.32
    });
    engine.addPolygon({
      id: "region-americas",
      coordinates: [
        { lng: -125, lat: -50, altitude: 0.005 },
        { lng: -35, lat: -50, altitude: 0.005 },
        { lng: -35, lat: 25, altitude: 0.005 },
        { lng: -125, lat: 25, altitude: 0.005 }
      ],
      fillColor: "#8b5cf6",
      opacity: 0.28
    });
  };

  const clearHeavyOverlays = (): void => {
    engine.removeLayer("markers");
    engine.removeLayer("polylines");
    engine.removeLayer("polygons");
  };

  const finalize = async (): Promise<void> => {
    try {
      await terrain.ready();
      const beforeTiles = terrain.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      container.dataset.phase = "baseline-profile";
      output.textContent = `baseline-profile:${beforeTiles || "none"}`;

      const baselineStatsBefore = snapshotSurfaceStats(terrain, rasterSource);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 100, lat: 24, altitude: 2.55, waitMs: 90 },
        { lng: 68, lat: 18, altitude: 2.35, waitMs: 90 },
        { lng: 34, lat: 26, altitude: 2.2, waitMs: 110 }
      ]);
      await terrain.ready();
      await sleep(150);
      const baselineMetrics = collectProfileMetrics(engine, terrain, rasterSource, baselineStatsBefore);
      const baselineAfterTiles = terrain.getActiveTileKeys().join(",");

      addHeavyOverlays();
      container.dataset.phase = "heavy-profile";
      output.textContent = `heavy-profile:${baselineAfterTiles || "none"}`;

      const heavyStatsBefore = snapshotSurfaceStats(terrain, rasterSource);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 20, lat: 30, altitude: 1.98, waitMs: 80 },
        { lng: -110, lat: 34, altitude: 1.62, waitMs: 80 },
        { lng: 72, lat: 18, altitude: 1.28, waitMs: 80 },
        { lng: 124, lat: 22, altitude: 1.1, waitMs: 100 }
      ]);
      await terrain.ready();
      await sleep(210);
      const heavyMetrics = collectProfileMetrics(engine, terrain, rasterSource, heavyStatsBefore);
      const heavyAfterTiles = terrain.getActiveTileKeys().join(",");

      clearHeavyOverlays();
      container.dataset.phase = "recovery-profile";
      output.textContent = `recovery-profile:${heavyAfterTiles || "none"}`;

      const recoveryStatsBefore = snapshotSurfaceStats(terrain, rasterSource);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 36, lat: 26, altitude: 2.18, waitMs: 90 },
        { lng: -12, lat: 30, altitude: 2.32, waitMs: 90 },
        { lng: 86, lat: 18, altitude: 2.48, waitMs: 110 }
      ]);
      await terrain.ready();
      await sleep(180);
      const recoveryMetrics = collectProfileMetrics(engine, terrain, rasterSource, recoveryStatsBefore);
      const recoveryAfterTiles = terrain.getActiveTileKeys().join(",");

      const heavyBaselineFpsRatio = normalizedFpsRatio(
        heavyMetrics.averageFPS,
        baselineMetrics.averageFPS
      );
      const recoveryBaselineFpsRatio = normalizedFpsRatio(
        recoveryMetrics.averageFPS,
        baselineMetrics.averageFPS
      );
      const recoveryHeavyFpsRatio = normalizedFpsRatio(
        recoveryMetrics.averageFPS,
        heavyMetrics.averageFPS
      );
      const layerRecovered = Number(
        baselineMetrics.layerCount === 2 &&
          heavyMetrics.layerCount === 5 &&
          recoveryMetrics.layerCount === baselineMetrics.layerCount
      );
      const sceneObjectRecovered = Number(
        heavyMetrics.sceneObjectCount > baselineMetrics.sceneObjectCount &&
          recoveryMetrics.sceneObjectCount <= baselineMetrics.sceneObjectCount + 1
      );
      const imageryRecoveryDelta = recoveryMetrics.imageryRequested - baselineMetrics.imageryRequested;
      const frameDropsRecoveryDelta = recoveryMetrics.frameDrops - baselineMetrics.frameDrops;

      const allExpected = Number(
        layerRecovered === 1 &&
          sceneObjectRecovered === 1 &&
          heavyBaselineFpsRatio > 0 &&
          recoveryBaselineFpsRatio > 0 &&
          recoveryHeavyFpsRatio > 0
      );

      frameLoopStopped = true;
      container.dataset.phase = "after-load-recovery";
      container.dataset.baselineAfterTiles = baselineAfterTiles;
      container.dataset.heavyAfterTiles = heavyAfterTiles;
      container.dataset.recoveryAfterTiles = recoveryAfterTiles;
      setDataAttribute(container, "baselineAverageFps", baselineMetrics.averageFPS);
      setDataAttribute(container, "heavyAverageFps", heavyMetrics.averageFPS);
      setDataAttribute(container, "recoveryAverageFps", recoveryMetrics.averageFPS);
      setDataAttribute(container, "heavyBaselineFpsRatio", heavyBaselineFpsRatio);
      setDataAttribute(container, "recoveryBaselineFpsRatio", recoveryBaselineFpsRatio);
      setDataAttribute(container, "recoveryHeavyFpsRatio", recoveryHeavyFpsRatio);
      setDataAttribute(container, "baselineFrameDrops", baselineMetrics.frameDrops);
      setDataAttribute(container, "heavyFrameDrops", heavyMetrics.frameDrops);
      setDataAttribute(container, "recoveryFrameDrops", recoveryMetrics.frameDrops);
      setDataAttribute(container, "frameDropsRecoveryDelta", frameDropsRecoveryDelta);
      setDataAttribute(container, "baselineImageryRequested", baselineMetrics.imageryRequested);
      setDataAttribute(container, "heavyImageryRequested", heavyMetrics.imageryRequested);
      setDataAttribute(container, "recoveryImageryRequested", recoveryMetrics.imageryRequested);
      setDataAttribute(container, "imageryRecoveryDelta", imageryRecoveryDelta);
      setDataAttribute(container, "baselineRenderCount", baselineMetrics.renderCount);
      setDataAttribute(container, "heavyRenderCount", heavyMetrics.renderCount);
      setDataAttribute(container, "recoveryRenderCount", recoveryMetrics.renderCount);
      setDataAttribute(container, "baselineLayerCount", baselineMetrics.layerCount);
      setDataAttribute(container, "heavyLayerCount", heavyMetrics.layerCount);
      setDataAttribute(container, "recoveryLayerCount", recoveryMetrics.layerCount);
      setDataAttribute(container, "baselineSceneObjectCount", baselineMetrics.sceneObjectCount);
      setDataAttribute(container, "heavySceneObjectCount", heavyMetrics.sceneObjectCount);
      setDataAttribute(container, "recoverySceneObjectCount", recoveryMetrics.sceneObjectCount);
      setDataAttribute(container, "layerRecovered", layerRecovered);
      setDataAttribute(container, "sceneObjectRecovered", sceneObjectRecovered);
      setDataAttribute(container, "markerCount", markerCount);
      setDataAttribute(container, "polylineCount", polylineCount);
      setDataAttribute(container, "polygonCount", polygonCount);
      setDataAttribute(container, "allExpected", allExpected);
      output.textContent = `after-load-recovery:${recoveryAfterTiles || "none"}:layerRecovered=${layerRecovered}:sceneRecovered=${sceneObjectRecovered}`;
    } catch (error) {
      handleError(error);
    }
  };

  container.dataset.phase = "booting";
  container.dataset.beforeTiles = "";
  container.dataset.baselineAfterTiles = "";
  container.dataset.heavyAfterTiles = "";
  container.dataset.recoveryAfterTiles = "";
  container.dataset.baselineAverageFps = "";
  container.dataset.heavyAverageFps = "";
  container.dataset.recoveryAverageFps = "";
  container.dataset.heavyBaselineFpsRatio = "";
  container.dataset.recoveryBaselineFpsRatio = "";
  container.dataset.recoveryHeavyFpsRatio = "";
  container.dataset.baselineFrameDrops = "";
  container.dataset.heavyFrameDrops = "";
  container.dataset.recoveryFrameDrops = "";
  container.dataset.frameDropsRecoveryDelta = "";
  container.dataset.baselineImageryRequested = "";
  container.dataset.heavyImageryRequested = "";
  container.dataset.recoveryImageryRequested = "";
  container.dataset.imageryRecoveryDelta = "";
  container.dataset.baselineRenderCount = "";
  container.dataset.heavyRenderCount = "";
  container.dataset.recoveryRenderCount = "";
  container.dataset.baselineLayerCount = "";
  container.dataset.heavyLayerCount = "";
  container.dataset.recoveryLayerCount = "";
  container.dataset.baselineSceneObjectCount = "";
  container.dataset.heavySceneObjectCount = "";
  container.dataset.recoverySceneObjectCount = "";
  container.dataset.layerRecovered = "";
  container.dataset.sceneObjectRecovered = "";
  container.dataset.markerCount = "";
  container.dataset.polylineCount = "";
  container.dataset.polygonCount = "";
  container.dataset.allExpected = "";
  output.textContent = "启动中:basic-globe-load-recovery-regression";

  engine.addLayer(terrain);
  engine.addLayer(rasterLayer);
  engine.setView({ lng: 110, lat: 28, altitude: 2.8 });
  window.requestAnimationFrame(frameLoop);
  void finalize();

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __basicGlobeLoadRecoveryRegression?: {
          engine: GlobeEngine;
          terrain: TerrainTileLayer;
          raster: RasterLayer;
        };
      }
    ).__basicGlobeLoadRecoveryRegression = {
      engine,
      terrain,
      raster: rasterLayer
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
      <div class="demo-status" id="status-output">启动中:basic-globe-load-recovery-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runBasicGlobeLoadRecoveryRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
