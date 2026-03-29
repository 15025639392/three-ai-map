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
    throw new Error("Missing 2D canvas context for basic load-recovery-stress tile");
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

function normalizedFpsRatio(left: number, right: number): number {
  if (left <= 0 || right <= 0) {
    return 0;
  }

  return Number((Math.min(left, right) / Math.max(left, right)).toFixed(4));
}

export function runBasicGlobeLoadRecoveryStressRegression(
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
  const cycleCount = 3;
  const surfaceTiles = new SurfaceTileLayer("basic-globe-load-recovery-stress-regression", {
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
        30 + ((coordinate.x + coordinate.y + coordinate.z) % 4) * 20,
        () => createImageryTile(coordinate),
        signal
      ),
    loadElevationTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(20, () => createElevationTile(coordinate), signal)
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

  const addHeavyOverlays = (cycleIndex: number): void => {
    const suffix = `c${cycleIndex + 1}`;
    const markers = [
      { id: `marker-shanghai-${suffix}`, lng: 121.47, lat: 31.23 },
      { id: `marker-tokyo-${suffix}`, lng: 139.69, lat: 35.69 },
      { id: `marker-newyork-${suffix}`, lng: -74.0, lat: 40.71 },
      { id: `marker-london-${suffix}`, lng: -0.12, lat: 51.51 },
      { id: `marker-sydney-${suffix}`, lng: 151.21, lat: -33.87 },
      { id: `marker-singapore-${suffix}`, lng: 103.82, lat: 1.35 },
      { id: `marker-dubai-${suffix}`, lng: 55.27, lat: 25.2 },
      { id: `marker-cape-town-${suffix}`, lng: 18.42, lat: -33.93 },
      { id: `marker-rio-${suffix}`, lng: -43.2, lat: -22.91 },
      { id: `marker-los-angeles-${suffix}`, lng: -118.24, lat: 34.05 },
      { id: `marker-mumbai-${suffix}`, lng: 72.88, lat: 19.08 },
      { id: `marker-paris-${suffix}`, lng: 2.35, lat: 48.86 }
    ];

    for (const marker of markers) {
      engine.addMarker({
        ...marker,
        altitude: 0.02,
        color: "#ffd166"
      });
    }

    engine.addPolyline({
      id: `route-east-west-${suffix}`,
      coordinates: [
        { lng: 121.47, lat: 31.23, altitude: 0.01 },
        { lng: -74.0, lat: 40.71, altitude: 0.01 }
      ],
      color: "#8ed6ff"
    });
    engine.addPolyline({
      id: `route-europe-asia-${suffix}`,
      coordinates: [
        { lng: -0.12, lat: 51.51, altitude: 0.01 },
        { lng: 139.69, lat: 35.69, altitude: 0.01 }
      ],
      color: "#c084fc"
    });
    engine.addPolyline({
      id: `route-south-${suffix}`,
      coordinates: [
        { lng: 103.82, lat: 1.35, altitude: 0.01 },
        { lng: 18.42, lat: -33.93, altitude: 0.01 }
      ],
      color: "#ff8f70"
    });
    engine.addPolyline({
      id: `route-oceania-${suffix}`,
      coordinates: [
        { lng: 151.21, lat: -33.87, altitude: 0.01 },
        { lng: 139.69, lat: 35.69, altitude: 0.01 }
      ],
      color: "#6ad8ff"
    });
    engine.addPolyline({
      id: `route-atlantic-${suffix}`,
      coordinates: [
        { lng: -43.2, lat: -22.91, altitude: 0.01 },
        { lng: 2.35, lat: 48.86, altitude: 0.01 }
      ],
      color: "#f472b6"
    });
    engine.addPolyline({
      id: `route-asia-${suffix}`,
      coordinates: [
        { lng: 72.88, lat: 19.08, altitude: 0.01 },
        { lng: 55.27, lat: 25.2, altitude: 0.01 }
      ],
      color: "#7dd3fc"
    });

    engine.addPolygon({
      id: `region-east-asia-${suffix}`,
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
      id: `region-europe-${suffix}`,
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
      id: `region-americas-${suffix}`,
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
      await surfaceTiles.ready();
      const beforeTiles = surfaceTiles.getActiveTileKeys().join(",");
      container.dataset.beforeTiles = beforeTiles;
      container.dataset.phase = "baseline-profile";
      output.textContent = `baseline-profile:${beforeTiles || "none"}`;

      const baselineStatsBefore = snapshotSurfaceStats(surfaceTiles);
      engine.resetPerformanceReport();
      await runViewSequence(engine, [
        { lng: 100, lat: 24, altitude: 2.55, waitMs: 90 },
        { lng: 68, lat: 18, altitude: 2.35, waitMs: 90 },
        { lng: 34, lat: 26, altitude: 2.2, waitMs: 110 }
      ]);
      await surfaceTiles.ready();
      await sleep(150);
      const baselineMetrics = collectProfileMetrics(engine, surfaceTiles, baselineStatsBefore);
      const baselineAfterTiles = surfaceTiles.getActiveTileKeys().join(",");

      const heavyMetricsByCycle: ProfileMetrics[] = [];
      const recoveryMetricsByCycle: ProfileMetrics[] = [];
      const heavyBaselineFpsRatios: number[] = [];
      const recoveryBaselineFpsRatios: number[] = [];
      const recoveryHeavyFpsRatios: number[] = [];
      let layerRecoveredCount = 0;
      let sceneObjectRecoveredCount = 0;
      let heavyImageryRequestedTotal = 0;
      let recoveryImageryRequestedTotal = 0;
      let heavyAfterTiles = "";
      let recoveryAfterTiles = "";

      for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
        addHeavyOverlays(cycleIndex);
        container.dataset.phase = `heavy-profile-cycle-${cycleIndex + 1}`;
        output.textContent = `heavy-profile-cycle-${cycleIndex + 1}:${baselineAfterTiles || "none"}`;

        const heavyStatsBefore = snapshotSurfaceStats(surfaceTiles);
        engine.resetPerformanceReport();
        await runViewSequence(engine, [
          { lng: 20 - cycleIndex * 8, lat: 30, altitude: 1.98, waitMs: 80 },
          { lng: -110 + cycleIndex * 10, lat: 34, altitude: 1.62, waitMs: 80 },
          { lng: 72 - cycleIndex * 6, lat: 18, altitude: 1.28, waitMs: 80 },
          { lng: 124 - cycleIndex * 9, lat: 22, altitude: 1.1, waitMs: 100 }
        ]);
        await surfaceTiles.ready();
        await sleep(210);
        const heavyMetrics = collectProfileMetrics(engine, surfaceTiles, heavyStatsBefore);
        heavyAfterTiles = surfaceTiles.getActiveTileKeys().join(",");
        heavyMetricsByCycle.push(heavyMetrics);
        heavyImageryRequestedTotal += heavyMetrics.imageryRequested;

        clearHeavyOverlays();
        container.dataset.phase = `recovery-profile-cycle-${cycleIndex + 1}`;
        output.textContent = `recovery-profile-cycle-${cycleIndex + 1}:${heavyAfterTiles || "none"}`;

        const recoveryStatsBefore = snapshotSurfaceStats(surfaceTiles);
        engine.resetPerformanceReport();
        await runViewSequence(engine, [
          { lng: 36 + cycleIndex * 8, lat: 26, altitude: 2.18, waitMs: 90 },
          { lng: -12 + cycleIndex * 7, lat: 30, altitude: 2.32, waitMs: 90 },
          { lng: 86 - cycleIndex * 10, lat: 18, altitude: 2.48, waitMs: 110 }
        ]);
        await surfaceTiles.ready();
        await sleep(180);
        const recoveryMetrics = collectProfileMetrics(engine, surfaceTiles, recoveryStatsBefore);
        recoveryAfterTiles = surfaceTiles.getActiveTileKeys().join(",");
        recoveryMetricsByCycle.push(recoveryMetrics);
        recoveryImageryRequestedTotal += recoveryMetrics.imageryRequested;

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
        heavyBaselineFpsRatios.push(heavyBaselineFpsRatio);
        recoveryBaselineFpsRatios.push(recoveryBaselineFpsRatio);
        recoveryHeavyFpsRatios.push(recoveryHeavyFpsRatio);

        const layerRecovered = Number(
          baselineMetrics.layerCount === 1 &&
            heavyMetrics.layerCount === 4 &&
            recoveryMetrics.layerCount === baselineMetrics.layerCount
        );
        const sceneObjectRecovered = Number(
          heavyMetrics.sceneObjectCount > baselineMetrics.sceneObjectCount &&
            recoveryMetrics.sceneObjectCount <= baselineMetrics.sceneObjectCount + 1
        );
        layerRecoveredCount += layerRecovered;
        sceneObjectRecoveredCount += sceneObjectRecovered;
      }

      const heavyAverageFpsMin = Number(
        Math.min(...heavyMetricsByCycle.map((metrics) => metrics.averageFPS)).toFixed(2)
      );
      const heavyAverageFpsMax = Number(
        Math.max(...heavyMetricsByCycle.map((metrics) => metrics.averageFPS)).toFixed(2)
      );
      const recoveryAverageFpsMin = Number(
        Math.min(...recoveryMetricsByCycle.map((metrics) => metrics.averageFPS)).toFixed(2)
      );
      const recoveryAverageFpsMax = Number(
        Math.max(...recoveryMetricsByCycle.map((metrics) => metrics.averageFPS)).toFixed(2)
      );
      const heavyBaselineFpsRatioMin = Number(Math.min(...heavyBaselineFpsRatios).toFixed(4));
      const heavyBaselineFpsRatioMax = Number(Math.max(...heavyBaselineFpsRatios).toFixed(4));
      const recoveryBaselineFpsRatioMin = Number(Math.min(...recoveryBaselineFpsRatios).toFixed(4));
      const recoveryBaselineFpsRatioMax = Number(Math.max(...recoveryBaselineFpsRatios).toFixed(4));
      const recoveryHeavyFpsRatioMin = Number(Math.min(...recoveryHeavyFpsRatios).toFixed(4));
      const recoveryHeavyFpsRatioMax = Number(Math.max(...recoveryHeavyFpsRatios).toFixed(4));
      const heavyFrameDropsMax = Math.max(...heavyMetricsByCycle.map((metrics) => metrics.frameDrops));
      const recoveryFrameDropsMax = Math.max(
        ...recoveryMetricsByCycle.map((metrics) => metrics.frameDrops)
      );
      const baselineLayerCount = baselineMetrics.layerCount;
      const heavyLayerCountMax = Math.max(...heavyMetricsByCycle.map((metrics) => metrics.layerCount));
      const recoveryLayerCountMin = Math.min(
        ...recoveryMetricsByCycle.map((metrics) => metrics.layerCount)
      );
      const baselineSceneObjectCount = baselineMetrics.sceneObjectCount;
      const heavySceneObjectCountMax = Math.max(
        ...heavyMetricsByCycle.map((metrics) => metrics.sceneObjectCount)
      );
      const recoverySceneObjectCountMin = Math.min(
        ...recoveryMetricsByCycle.map((metrics) => metrics.sceneObjectCount)
      );
      const recoverySceneObjectCountMax = Math.max(
        ...recoveryMetricsByCycle.map((metrics) => metrics.sceneObjectCount)
      );
      const stableRecoverySceneObjectCount = Number(
        recoverySceneObjectCountMin === recoverySceneObjectCountMax
      );
      const imageryRecoveryDelta = recoveryImageryRequestedTotal - baselineMetrics.imageryRequested;

      const allExpected = Number(
        layerRecoveredCount === cycleCount &&
          sceneObjectRecoveredCount === cycleCount &&
          stableRecoverySceneObjectCount === 1 &&
          heavyBaselineFpsRatioMin > 0 &&
          recoveryBaselineFpsRatioMin > 0 &&
          recoveryHeavyFpsRatioMin > 0
      );

      frameLoopStopped = true;
      container.dataset.phase = "after-load-recovery-stress";
      container.dataset.baselineAfterTiles = baselineAfterTiles;
      container.dataset.heavyAfterTiles = heavyAfterTiles;
      container.dataset.recoveryAfterTiles = recoveryAfterTiles;
      setDataAttribute(container, "baselineAverageFps", baselineMetrics.averageFPS);
      setDataAttribute(container, "heavyAverageFpsMin", heavyAverageFpsMin);
      setDataAttribute(container, "heavyAverageFpsMax", heavyAverageFpsMax);
      setDataAttribute(container, "recoveryAverageFpsMin", recoveryAverageFpsMin);
      setDataAttribute(container, "recoveryAverageFpsMax", recoveryAverageFpsMax);
      setDataAttribute(container, "heavyBaselineFpsRatioMin", heavyBaselineFpsRatioMin);
      setDataAttribute(container, "heavyBaselineFpsRatioMax", heavyBaselineFpsRatioMax);
      setDataAttribute(container, "recoveryBaselineFpsRatioMin", recoveryBaselineFpsRatioMin);
      setDataAttribute(container, "recoveryBaselineFpsRatioMax", recoveryBaselineFpsRatioMax);
      setDataAttribute(container, "recoveryHeavyFpsRatioMin", recoveryHeavyFpsRatioMin);
      setDataAttribute(container, "recoveryHeavyFpsRatioMax", recoveryHeavyFpsRatioMax);
      setDataAttribute(container, "baselineFrameDrops", baselineMetrics.frameDrops);
      setDataAttribute(container, "heavyFrameDropsMax", heavyFrameDropsMax);
      setDataAttribute(container, "recoveryFrameDropsMax", recoveryFrameDropsMax);
      setDataAttribute(container, "baselineImageryRequested", baselineMetrics.imageryRequested);
      setDataAttribute(container, "heavyImageryRequestedTotal", heavyImageryRequestedTotal);
      setDataAttribute(container, "recoveryImageryRequestedTotal", recoveryImageryRequestedTotal);
      setDataAttribute(container, "imageryRecoveryDelta", imageryRecoveryDelta);
      setDataAttribute(container, "baselineRenderCount", baselineMetrics.renderCount);
      setDataAttribute(
        container,
        "heavyRenderCountMax",
        Math.max(...heavyMetricsByCycle.map((metrics) => metrics.renderCount))
      );
      setDataAttribute(
        container,
        "recoveryRenderCountMax",
        Math.max(...recoveryMetricsByCycle.map((metrics) => metrics.renderCount))
      );
      setDataAttribute(container, "baselineLayerCount", baselineLayerCount);
      setDataAttribute(container, "heavyLayerCountMax", heavyLayerCountMax);
      setDataAttribute(container, "recoveryLayerCountMin", recoveryLayerCountMin);
      setDataAttribute(container, "baselineSceneObjectCount", baselineSceneObjectCount);
      setDataAttribute(container, "heavySceneObjectCountMax", heavySceneObjectCountMax);
      setDataAttribute(container, "recoverySceneObjectCountMin", recoverySceneObjectCountMin);
      setDataAttribute(container, "recoverySceneObjectCountMax", recoverySceneObjectCountMax);
      setDataAttribute(container, "cycleCount", cycleCount);
      setDataAttribute(container, "layerRecoveredCount", layerRecoveredCount);
      setDataAttribute(container, "sceneObjectRecoveredCount", sceneObjectRecoveredCount);
      setDataAttribute(container, "stableRecoverySceneObjectCount", stableRecoverySceneObjectCount);
      setDataAttribute(container, "markerCount", markerCount);
      setDataAttribute(container, "polylineCount", polylineCount);
      setDataAttribute(container, "polygonCount", polygonCount);
      setDataAttribute(container, "allExpected", allExpected);
      output.textContent = `after-load-recovery-stress:${recoveryAfterTiles || "none"}:layerRecovered=${layerRecoveredCount}/${cycleCount}:sceneRecovered=${sceneObjectRecoveredCount}/${cycleCount}`;
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
  container.dataset.heavyAverageFpsMin = "";
  container.dataset.heavyAverageFpsMax = "";
  container.dataset.recoveryAverageFpsMin = "";
  container.dataset.recoveryAverageFpsMax = "";
  container.dataset.heavyBaselineFpsRatioMin = "";
  container.dataset.heavyBaselineFpsRatioMax = "";
  container.dataset.recoveryBaselineFpsRatioMin = "";
  container.dataset.recoveryBaselineFpsRatioMax = "";
  container.dataset.recoveryHeavyFpsRatioMin = "";
  container.dataset.recoveryHeavyFpsRatioMax = "";
  container.dataset.baselineFrameDrops = "";
  container.dataset.heavyFrameDropsMax = "";
  container.dataset.recoveryFrameDropsMax = "";
  container.dataset.baselineImageryRequested = "";
  container.dataset.heavyImageryRequestedTotal = "";
  container.dataset.recoveryImageryRequestedTotal = "";
  container.dataset.imageryRecoveryDelta = "";
  container.dataset.baselineRenderCount = "";
  container.dataset.heavyRenderCountMax = "";
  container.dataset.recoveryRenderCountMax = "";
  container.dataset.baselineLayerCount = "";
  container.dataset.heavyLayerCountMax = "";
  container.dataset.recoveryLayerCountMin = "";
  container.dataset.baselineSceneObjectCount = "";
  container.dataset.heavySceneObjectCountMax = "";
  container.dataset.recoverySceneObjectCountMin = "";
  container.dataset.recoverySceneObjectCountMax = "";
  container.dataset.cycleCount = "";
  container.dataset.layerRecoveredCount = "";
  container.dataset.sceneObjectRecoveredCount = "";
  container.dataset.stableRecoverySceneObjectCount = "";
  container.dataset.markerCount = "";
  container.dataset.polylineCount = "";
  container.dataset.polygonCount = "";
  container.dataset.allExpected = "";
  output.textContent = "booting:basic-globe-load-recovery-stress-regression";

  engine.addLayer(surfaceTiles);
  engine.setView({ lng: 110, lat: 28, altitude: 2.8 });
  window.requestAnimationFrame(frameLoop);
  void finalize();

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __basicGlobeLoadRecoveryStressRegression?: {
          engine: GlobeEngine;
          surfaceTiles: SurfaceTileLayer;
        };
      }
    ).__basicGlobeLoadRecoveryStressRegression = {
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
      <div class="demo-status" id="status-output">booting:basic-globe-load-recovery-stress-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runBasicGlobeLoadRecoveryStressRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
