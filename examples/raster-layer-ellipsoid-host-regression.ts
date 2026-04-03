import "../src/styles.css";
import { GlobeEngine, RasterLayer, RasterTileSource } from "../src";
import { computeTargetZoom, type TileCoordinate } from "../src/tiles/TileViewport";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function createImageryTile(coordinate: TileCoordinate): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Missing 2D canvas context for ellipsoid raster regression tile");
  }

  const hue = (coordinate.x * 19 + coordinate.y * 37 + coordinate.z * 41) % 360;
  context.fillStyle = `hsl(${hue} 70% 46%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.font = "bold 18px sans-serif";
  context.fillText(`z${coordinate.z}`, 12, 28);
  context.font = "15px sans-serif";
  context.fillText(`${coordinate.x}/${coordinate.y}`, 12, 52);

  return canvas;
}

export function runRasterLayerEllipsoidHostRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 1280, 720);

  const requestedCoordinates: TileCoordinate[] = [];
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const rasterSource = new RasterTileSource("raster", {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 64,
    minZoom: 0,
    maxZoom: 18,
    cache: 128,
    concurrency: 8,
    loadTile: async (coordinate) => {
      requestedCoordinates.push(coordinate);
      return createImageryTile(coordinate);
    }
  });
  const rasterLayer = new RasterLayer({ id: "raster-layer", source: "raster" });

  const fail = (error: unknown): void => {
    container.dataset.phase = "error";
    container.dataset.rasterMeshCount = "";
    container.dataset.requestedImageryCount = "";
    container.dataset.requestedImageryMaxZoom = "";
    container.dataset.requestedImageryKeys = "";
    container.dataset.expectedImageryTargetZoom = "";
    container.dataset.hostSwapCount = "";
    container.dataset.imageryAncestorFallbackCount = "";
    output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
  };

  const finalize = (): void => {
    const requestedKeys = [...new Set(
      requestedCoordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
    )];
    const rasterMeshCount = engine.sceneSystem.scene.getObjectByName("raster-layer")?.children.length ?? 0;
    const maxRequestedZoom = requestedCoordinates.length > 0
      ? Math.max(...requestedCoordinates.map((coordinate) => coordinate.z))
      : Number.NaN;
    const expectedImageryTargetZoom = computeTargetZoom({
      camera: engine.sceneSystem.camera,
      viewportWidth: container.clientWidth || 1,
      viewportHeight: container.clientHeight || 1,
      radius: engine.radius,
      tileSize: rasterSource.tileSize,
      minZoom: rasterSource.minZoom,
      maxZoom: rasterSource.maxZoom
    });

    const hasExpectedImageryZoom = Number.isFinite(maxRequestedZoom) && maxRequestedZoom >= expectedImageryTargetZoom;
    const hasVisibleMesh = rasterMeshCount > 0;
    const rasterStats = rasterLayer.getDebugStats();

    container.dataset.phase = hasExpectedImageryZoom && hasVisibleMesh ? "after-ellipsoid-imagery" : "error";
    container.dataset.rasterMeshCount = `${rasterMeshCount}`;
    container.dataset.requestedImageryCount = `${requestedKeys.length}`;
    container.dataset.requestedImageryMaxZoom = Number.isFinite(maxRequestedZoom)
      ? `${maxRequestedZoom}`
      : "";
    container.dataset.requestedImageryKeys = requestedKeys.join(",");
    container.dataset.expectedImageryTargetZoom = `${expectedImageryTargetZoom}`;
    container.dataset.hostSwapCount = `${rasterStats.hostSwapCount}`;
    container.dataset.imageryAncestorFallbackCount = `${rasterStats.ancestorFallbackCount}`;

    if (!hasVisibleMesh) {
      output.textContent = "错误:无地形时 RasterLayer 未生成可见 mesh";
      return;
    }

    if (!hasExpectedImageryZoom) {
      output.textContent = `错误:请求影像 maxZoom(${maxRequestedZoom}) 未达到目标(${expectedImageryTargetZoom})`;
      return;
    }

    output.textContent = `after-ellipsoid-imagery:maxZ=${maxRequestedZoom}:mesh=${rasterMeshCount}`;
  };

  const startTime = performance.now();
  const tick = (): void => {
    engine.render();
    const rasterMeshCount = engine.sceneSystem.scene.getObjectByName("raster-layer")?.children.length ?? 0;
    const maxRequestedZoom = requestedCoordinates.length > 0
      ? Math.max(...requestedCoordinates.map((coordinate) => coordinate.z))
      : Number.NaN;

    if (rasterMeshCount > 0 && Number.isFinite(maxRequestedZoom) && maxRequestedZoom >= rasterSource.maxZoom) {
      window.setTimeout(finalize, 120);
      return;
    }

    if (performance.now() - startTime > 4000) {
      finalize();
      return;
    }

    window.setTimeout(() => {
      tick();
    }, 50);
  };

  container.dataset.phase = "booting";
  container.dataset.rasterMeshCount = "";
  container.dataset.requestedImageryCount = "";
  container.dataset.requestedImageryMaxZoom = "";
  container.dataset.requestedImageryKeys = "";
  container.dataset.expectedImageryTargetZoom = "";
  container.dataset.hostSwapCount = "";
  container.dataset.imageryAncestorFallbackCount = "";
  output.textContent = "启动中:raster-layer-ellipsoid-host-regression";

  engine.addSource("raster", rasterSource);
  engine.addLayer(rasterLayer);
  engine.setView({
    lng: 118.212890625,
    lat: 39.571789134975425,
    altitude: 0.01
  });

  tick();

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __rasterLayerEllipsoidHostRegression?: {
          engine: GlobeEngine;
          raster: RasterLayer;
          rasterSource: RasterTileSource;
        };
      }
    ).__rasterLayerEllipsoidHostRegression = {
      engine,
      raster: rasterLayer,
      rasterSource
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
      <div class="demo-status" id="status-output">启动中:raster-layer-ellipsoid-host-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runRasterLayerEllipsoidHostRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
