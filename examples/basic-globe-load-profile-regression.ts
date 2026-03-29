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
    throw new Error("Missing 2D canvas context for basic load-profile tile");
  }

  const hue = (coordinate.x * 31 + coordinate.y * 47 + coordinate.z * 59) % 360;
  context.fillStyle = `hsl(${hue} 64% 42%)`;
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
  const base = 120 + coordinate.z * 20 + coordinate.x * 3 + coordinate.y * 5;

  for (let index = 0; index < data.length; index += 1) {
    data[index] = base + (index % width) * 6;
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

function snapshotSurfaceStats(layer: SurfaceTileLayer): SurfaceStatsSnapshot {
  const stats = layer.getDebugStats();
  return {
    imageryRequested: stats.imagery.requested,
    imageryCancelled: stats.imagery.cancelled,
    elevationRequested: stats.elevation.requested,
    elevationCancelled: stats.elevation.cancelled
  };
}

function collectProfileMetrics(
  engine: GlobeEngine,
  layer: SurfaceTileLayer,
  snapshotBefore: SurfaceStatsSnapshot
): ProfileMetrics {
  const report = engine.getPerformanceReport();
  const stats = layer.getDebugStats();

  return {
    averageFPS: Number(Math.min(Math.max(report.averageFPS, 0), 1200).toFixed(2)),
    frameDrops: report.frameDrops,
    imageryRequested: stats.imagery.requested - snapshotBefore.imageryRequested,
    imageryCancelled: stats.imagery.cancelled - snapshotBefore.imageryCancelled,
    elevationRequested: stats.elevation.requested - snapshotBefore.elevationRequested,
    elevationCancelled: stats.elevation.cancelled - snapshotBefore.elevationCancelled,
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

export function runBasicGlobeLoadProfileRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);

  const markerCount = 8;
  const polylineCount = 4;
  const polygonCount = 2;
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const surfaceTiles = new SurfaceTileLayer("basic-globe-load-profile-regression", {
    minZoom: 2,
    maxZoom: 10,
    tileSize: 128,
    meshSegments: 3,
    skirtDepthMeters: 900,
    elevationExaggeration: 1,
    zoomExaggerationBoost: 1.8,
    selectTiles: ({ camera, radius }) => selectDeterministicTiles({ camera, radius }),
    loadImageryTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(
        26 + ((coordinate.x + coordinate.y + coordinate.z) % 4) * 20,
        () => createImageryTile(coordinate),
        signal
      ),
    loadElevationTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(18, () => createElevationTile(coordinate), signal)
  });

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

  const addStressOverlays = (): void => {
    const markers = [
      { id: "marker-shanghai", lng: 121.47, lat: 31.23 },
      { id: "marker-tokyo", lng: 139.69, lat: 35.69 },
      { id: "marker-newyork", lng: -74.0, lat: 40.71 },
      { id: "marker-london", lng: -0.12, lat: 51.51 },
      { id: "marker-sydney", lng: 151.21, lat: -33.87 },
      { id: "marker-singapore", lng: 103.82, lat: 1.35 },
      { id: "marker-dubai", lng: 55.27, lat: 25.2 },
      { id: "marker-cape-town", lng: 18.42, lat: -33.93 }
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
  };

  const finalize = async (): Promise<void> => {
    try {
      await surfaceTiles.ready();
      const beforeTiles = surfaceTiles.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      container.dataset.phase = "baseline-profile";
      output.textContent = `baseline-profile:${beforeTiles || "none"}`;

      const baselineStatsBefore = snapshotSurfaceStats(surfaceTiles);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 96, lat: 24, altitude: 2.55, waitMs: 90 },
        { lng: 60, lat: 18, altitude: 2.35, waitMs: 90 },
        { lng: 30, lat: 26, altitude: 2.2, waitMs: 110 }
      ]);
      await surfaceTiles.ready();
      await sleep(150);
      const baselineMetrics = collectProfileMetrics(engine, surfaceTiles, baselineStatsBefore);
      const baselineAfterTiles = surfaceTiles.getActiveTileKeys().join(",");

      addStressOverlays();
      container.dataset.phase = "stress-profile";
      output.textContent = `stress-profile:${baselineAfterTiles || "none"}`;

      const stressStatsBefore = snapshotSurfaceStats(surfaceTiles);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 18, lat: 30, altitude: 1.95, waitMs: 70 },
        { lng: -112, lat: 36, altitude: 1.45, waitMs: 70 },
        { lng: 72, lat: 14, altitude: 1.15, waitMs: 70 },
        { lng: 128, lat: 24, altitude: 1.1, waitMs: 90 }
      ]);
      await surfaceTiles.ready();
      await sleep(200);
      const stressMetrics = collectProfileMetrics(engine, surfaceTiles, stressStatsBefore);
      const stressAfterTiles = surfaceTiles.getActiveTileKeys().join(",");

      const fpsRatio =
        baselineMetrics.averageFPS > 0 && stressMetrics.averageFPS > 0
          ? Number(
              (
                Math.min(stressMetrics.averageFPS, baselineMetrics.averageFPS) /
                Math.max(stressMetrics.averageFPS, baselineMetrics.averageFPS)
              ).toFixed(4)
            )
          : 0;
      const frameDropsDelta = stressMetrics.frameDrops - baselineMetrics.frameDrops;
      const sceneObjectDelta = stressMetrics.sceneObjectCount - baselineMetrics.sceneObjectCount;
      const imageryRequestedDelta = stressMetrics.imageryRequested - baselineMetrics.imageryRequested;

      const allExpected = Number(
        baselineMetrics.layerCount === 1 &&
          stressMetrics.layerCount >= 4 &&
          Number.isFinite(fpsRatio) &&
          fpsRatio > 0 &&
          sceneObjectDelta > 0
      );

      frameLoopStopped = true;
      container.dataset.phase = "after-load-profile";
      container.dataset.baselineAfterTiles = baselineAfterTiles;
      container.dataset.stressAfterTiles = stressAfterTiles;
      setDataAttribute(container, "baselineAverageFps", baselineMetrics.averageFPS);
      setDataAttribute(container, "stressAverageFps", stressMetrics.averageFPS);
      setDataAttribute(container, "fpsRatio", fpsRatio);
      setDataAttribute(container, "baselineFrameDrops", baselineMetrics.frameDrops);
      setDataAttribute(container, "stressFrameDrops", stressMetrics.frameDrops);
      setDataAttribute(container, "frameDropsDelta", frameDropsDelta);
      setDataAttribute(container, "baselineImageryRequested", baselineMetrics.imageryRequested);
      setDataAttribute(container, "stressImageryRequested", stressMetrics.imageryRequested);
      setDataAttribute(container, "imageryRequestedDelta", imageryRequestedDelta);
      setDataAttribute(container, "baselineImageryCancelled", baselineMetrics.imageryCancelled);
      setDataAttribute(container, "stressImageryCancelled", stressMetrics.imageryCancelled);
      setDataAttribute(container, "baselineElevationRequested", baselineMetrics.elevationRequested);
      setDataAttribute(container, "stressElevationRequested", stressMetrics.elevationRequested);
      setDataAttribute(container, "baselineRenderCount", baselineMetrics.renderCount);
      setDataAttribute(container, "stressRenderCount", stressMetrics.renderCount);
      setDataAttribute(container, "baselineLayerCount", baselineMetrics.layerCount);
      setDataAttribute(container, "stressLayerCount", stressMetrics.layerCount);
      setDataAttribute(container, "baselineSceneObjectCount", baselineMetrics.sceneObjectCount);
      setDataAttribute(container, "stressSceneObjectCount", stressMetrics.sceneObjectCount);
      setDataAttribute(container, "sceneObjectDelta", sceneObjectDelta);
      setDataAttribute(container, "baselineCameraAltitude", baselineMetrics.cameraAltitude);
      setDataAttribute(container, "stressCameraAltitude", stressMetrics.cameraAltitude);
      setDataAttribute(container, "markerCount", markerCount);
      setDataAttribute(container, "polylineCount", polylineCount);
      setDataAttribute(container, "polygonCount", polygonCount);
      setDataAttribute(container, "allExpected", allExpected);
      output.textContent = `after-load-profile:${stressAfterTiles || "none"}:ratio=${fpsRatio}:sceneDelta=${sceneObjectDelta}`;
    } catch (error) {
      handleError(error);
    }
  };

  container.dataset.phase = "booting";
  container.dataset.beforeTiles = "";
  container.dataset.baselineAfterTiles = "";
  container.dataset.stressAfterTiles = "";
  container.dataset.baselineAverageFps = "";
  container.dataset.stressAverageFps = "";
  container.dataset.fpsRatio = "";
  container.dataset.baselineFrameDrops = "";
  container.dataset.stressFrameDrops = "";
  container.dataset.frameDropsDelta = "";
  container.dataset.baselineImageryRequested = "";
  container.dataset.stressImageryRequested = "";
  container.dataset.imageryRequestedDelta = "";
  container.dataset.baselineImageryCancelled = "";
  container.dataset.stressImageryCancelled = "";
  container.dataset.baselineElevationRequested = "";
  container.dataset.stressElevationRequested = "";
  container.dataset.baselineRenderCount = "";
  container.dataset.stressRenderCount = "";
  container.dataset.baselineLayerCount = "";
  container.dataset.stressLayerCount = "";
  container.dataset.baselineSceneObjectCount = "";
  container.dataset.stressSceneObjectCount = "";
  container.dataset.sceneObjectDelta = "";
  container.dataset.baselineCameraAltitude = "";
  container.dataset.stressCameraAltitude = "";
  container.dataset.markerCount = "";
  container.dataset.polylineCount = "";
  container.dataset.polygonCount = "";
  container.dataset.allExpected = "";
  output.textContent = "booting:basic-globe-load-profile-regression";

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 110, lat: 28, altitude: 2.8 });
  window.requestAnimationFrame(frameLoop);
  void finalize();

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __basicGlobeLoadProfileRegression?: {
          engine: GlobeEngine;
          surfaceTiles: SurfaceTileLayer;
        };
      }
    ).__basicGlobeLoadProfileRegression = {
      engine,
      surfaceTiles
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
      <div class="demo-status" id="status-output">booting:basic-globe-load-profile-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runBasicGlobeLoadProfileRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
