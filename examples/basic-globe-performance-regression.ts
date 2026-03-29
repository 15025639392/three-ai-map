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
    throw new Error("Missing 2D canvas context for basic performance tile");
  }

  const hue = (coordinate.x * 31 + coordinate.y * 47 + coordinate.z * 59) % 360;
  context.fillStyle = `hsl(${hue} 68% 44%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,0.5)";
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

export function runBasicGlobePerformanceRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);

  const markerCount = 4;
  const polylineCount = 2;
  const polygonCount = 1;
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const surfaceTiles = new SurfaceTileLayer("basic-globe-performance-regression", {
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
        24 + ((coordinate.x + coordinate.y + coordinate.z) % 4) * 16,
        () => createImageryTile(coordinate),
        signal
      ),
    loadElevationTile: async (coordinate, signal?: AbortSignal) =>
      delayValue(16, () => createElevationTile(coordinate), signal)
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

  const finalize = (): void => {
    frameLoopStopped = true;
    const report = engine.getPerformanceReport();
    const stats = surfaceTiles.getDebugStats();
      const averageFPS = Number(Math.min(Math.max(report.averageFPS, 0), 1200).toFixed(2));
    const frameTime = Number(report.frameTime.toFixed(2));
    const imageryCancelRatio = stats.imagery.requested > 0
      ? Number((stats.imagery.cancelled / stats.imagery.requested).toFixed(4))
      : 0;
    const renderCount = report.metrics.get("renderCount")?.value ?? 0;
    const layerCount = report.metrics.get("layerCount")?.value ?? 0;
    const sceneObjectCount = report.metrics.get("sceneObjectCount")?.value ?? 0;
    const cameraAltitude = report.metrics.get("cameraAltitude")?.value ?? 0;

    container.dataset.phase = "after-basic-performance";
    container.dataset.afterTiles = surfaceTiles.getActiveTileKeys().join(",");
    container.dataset.averageFps = `${averageFPS}`;
    container.dataset.frameTime = `${frameTime}`;
    container.dataset.frameDrops = `${report.frameDrops}`;
    container.dataset.imageryRequested = `${stats.imagery.requested}`;
    container.dataset.imageryCancelled = `${stats.imagery.cancelled}`;
    container.dataset.elevationRequested = `${stats.elevation.requested}`;
    container.dataset.elevationCancelled = `${stats.elevation.cancelled}`;
    container.dataset.imageryCancelRatio = `${imageryCancelRatio}`;
    container.dataset.renderCount = `${renderCount}`;
    container.dataset.layerCount = `${layerCount}`;
    container.dataset.sceneObjectCount = `${sceneObjectCount}`;
    container.dataset.cameraAltitude = `${cameraAltitude}`;
    container.dataset.markerCount = `${markerCount}`;
    container.dataset.polylineCount = `${polylineCount}`;
    container.dataset.polygonCount = `${polygonCount}`;
    container.dataset.usedJsHeapSize = `${report.memory?.usedJSHeapSize ?? "na"}`;
    output.textContent = `after-basic-performance:${container.dataset.afterTiles || "none"}:fps=${averageFPS}:cancel=${imageryCancelRatio}`;
  };

  container.dataset.phase = "booting";
  container.dataset.beforeTiles = "";
  container.dataset.afterTiles = "";
  container.dataset.averageFps = "";
  container.dataset.frameTime = "";
  container.dataset.frameDrops = "";
  container.dataset.imageryRequested = "";
  container.dataset.imageryCancelled = "";
  container.dataset.elevationRequested = "";
  container.dataset.elevationCancelled = "";
  container.dataset.imageryCancelRatio = "";
  container.dataset.renderCount = "";
  container.dataset.layerCount = "";
  container.dataset.sceneObjectCount = "";
  container.dataset.cameraAltitude = "";
  container.dataset.markerCount = "";
  container.dataset.polylineCount = "";
  container.dataset.polygonCount = "";
  container.dataset.usedJsHeapSize = "";
  output.textContent = "booting:basic-globe-performance-regression";

  engine.addLayer(surfaceTiles);

  engine.addMarker({
    id: "marker-shanghai",
    lng: 121.47,
    lat: 31.23,
    altitude: 0.02,
    color: "#ffd166"
  });
  engine.addMarker({
    id: "marker-tokyo",
    lng: 139.69,
    lat: 35.69,
    altitude: 0.02,
    color: "#ff8f70"
  });
  engine.addMarker({
    id: "marker-newyork",
    lng: -74.0,
    lat: 40.71,
    altitude: 0.02,
    color: "#6ad8ff"
  });
  engine.addMarker({
    id: "marker-london",
    lng: -0.12,
    lat: 51.51,
    altitude: 0.02,
    color: "#c084fc"
  });

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

  engine.setView({ lng: 110, lat: 28, altitude: 2.8 });
  window.requestAnimationFrame(frameLoop);

  void surfaceTiles.ready()
    .then(() => {
      container.dataset.beforeTiles = surfaceTiles.getActiveTileKeys().join(",");
      container.dataset.phase = "before-tour";
      output.textContent = `before-tour:${container.dataset.beforeTiles || "none"}`;
      engine.resetPerformanceReport();

      window.setTimeout(() => {
        container.dataset.phase = "tour-step-1";
        engine.setView({ lng: 25, lat: 24, altitude: 2.05 });

        window.setTimeout(() => {
          container.dataset.phase = "tour-step-2";
          engine.setView({ lng: -120, lat: 36, altitude: 1.45 });

          window.setTimeout(() => {
            container.dataset.phase = "tour-step-3";
            engine.setView({ lng: 70, lat: 14, altitude: 1.15 });

            void surfaceTiles.ready()
              .then(() => {
                output.textContent = `settling:${surfaceTiles.getActiveTileKeys().join(",") || "none"}`;
                window.setTimeout(finalize, 180);
              })
              .catch(handleError);
          }, 28);
        }, 28);
      }, 120);
    })
    .catch(handleError);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __basicGlobePerformanceRegression?: {
          engine: GlobeEngine;
          surfaceTiles: SurfaceTileLayer;
        };
      }
    ).__basicGlobePerformanceRegression = {
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
      <div class="demo-status" id="status-output">booting:basic-globe-performance-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runBasicGlobePerformanceRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
