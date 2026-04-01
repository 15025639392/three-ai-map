import "../src/styles.css";
import { GlobeEngine, TerrainTileLayer, TerrainTileSource, RasterLayer, RasterTileSource } from "../src";
import type { ElevationTileData } from "../src";
import type { TileCoordinate } from "../src/tiles/TileViewport";

const HOST_TILE = { z: 11, x: 1696, y: 778 } as const;
const HOST_TILE_CENTER = { lng: 118.212890625, lat: 39.571789134975425 };

function createFlatElevationTile(): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 0, 0])
  };
}

function createImageryTile(coordinate: TileCoordinate): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Missing 2D canvas context for imagery zoom regression tile");
  }

  const hue = (coordinate.x * 17 + coordinate.y * 31 + coordinate.z * 53) % 360;
  context.fillStyle = `hsl(${hue} 72% 46%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.45)";
  context.lineWidth = 8;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  context.fillStyle = "#ffffff";
  context.font = "bold 18px sans-serif";
  context.fillText(`${coordinate.z}`, 16, 30);
  context.font = "16px sans-serif";
  context.fillText(`${coordinate.x}/${coordinate.y}`, 16, 54);

  return canvas;
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

export function runRasterLayerImageryZoomRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 1280, 720);

  const requestedCoordinates: TileCoordinate[] = [];
  let frameLoopStopped = false;
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const terrainSourceId = "terrain-host";
  const terrainSource = new TerrainTileSource(terrainSourceId, {
    tiles: ["memory://{z}/{x}/{y}.png"],
    encode: "terrarium",
    minZoom: HOST_TILE.z,
    maxZoom: HOST_TILE.z,
    tileSize: 256,
    cache: 8,
    concurrency: 8,
    loadTile: async () => createFlatElevationTile()
  });
  engine.addSource(terrainSourceId, terrainSource);
  const terrain = new TerrainTileLayer("terrain", {
    source: terrainSourceId,
    minMeshSegments: 8,
    maxMeshSegments: 8,
    skirtDepthMeters: 0,
    elevationExaggeration: 0
  });
  const rasterSource = new RasterTileSource("raster", {
    tiles: ["memory://{z}/{x}/{y}.png"],
    tileSize: 32,
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

  const stopFrameLoop = (): void => {
    frameLoopStopped = true;
  };

  const frameLoop = (): void => {
    if (frameLoopStopped) {
      return;
    }

    engine.render();
    window.requestAnimationFrame(frameLoop);
  };

  const finalize = (): void => {
    stopFrameLoop();
    const requestedKeys = [...new Set(
      requestedCoordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
    )];
    const rasterMeshCount = engine.sceneSystem.scene.getObjectByName("raster-layer")?.children.length ?? 0;
    const maxRequestedZoom = requestedCoordinates.length > 0
      ? Math.max(...requestedCoordinates.map((coordinate) => coordinate.z))
      : Number.NaN;

    container.dataset.phase = Number.isFinite(maxRequestedZoom) && maxRequestedZoom > HOST_TILE.z
      ? "after-imagery-zoom"
      : "error";
    container.dataset.hostTileKey = `${HOST_TILE.z}/${HOST_TILE.x}/${HOST_TILE.y}`;
    container.dataset.rasterMeshCount = `${rasterMeshCount}`;
    container.dataset.requestedImageryCount = `${requestedKeys.length}`;
    container.dataset.requestedImageryMaxZoom = Number.isFinite(maxRequestedZoom)
      ? `${maxRequestedZoom}`
      : "";
    container.dataset.requestedImageryKeys = requestedKeys.join(",");
    output.textContent = Number.isFinite(maxRequestedZoom) && maxRequestedZoom > HOST_TILE.z
      ? `after-imagery-zoom:maxZ=${maxRequestedZoom}:count=${requestedKeys.length}`
      : "错误:imagery zoom 未超过 terrain host zoom";
  };

  const fail = (error: unknown): void => {
    stopFrameLoop();
    container.dataset.phase = "error";
    container.dataset.requestedImageryCount = "";
    container.dataset.requestedImageryMaxZoom = "";
    container.dataset.requestedImageryKeys = "";
    output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
  };

  const waitForImageryZoom = (startTime: number): void => {
    if (requestedCoordinates.some((coordinate) => coordinate.z > HOST_TILE.z)) {
      window.setTimeout(finalize, 120);
      return;
    }

    if (performance.now() - startTime > 2500) {
      fail(new Error("Imagery zoom did not exceed terrain host zoom"));
      return;
    }

    window.setTimeout(() => {
      waitForImageryZoom(startTime);
    }, 50);
  };

  container.dataset.phase = "booting";
  container.dataset.hostTileKey = "";
  container.dataset.rasterMeshCount = "";
  container.dataset.requestedImageryCount = "";
  container.dataset.requestedImageryMaxZoom = "";
  container.dataset.requestedImageryKeys = "";
  output.textContent = "启动中:raster-layer-imagery-zoom-regression";

  engine.addSource("raster", rasterSource);
  engine.addLayer(terrain);
  engine.addLayer(rasterLayer);
  engine.setView({
    lng: HOST_TILE_CENTER.lng,
    lat: HOST_TILE_CENTER.lat,
    altitude: 0.02
  });

  void terrain.ready()
    .then(() => {
      frameLoop();
      waitForImageryZoom(performance.now());
    })
    .catch((error: unknown) => {
      fail(error);
    });

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __rasterLayerImageryZoomRegression?: {
          engine: GlobeEngine;
          terrain: TerrainTileLayer;
          raster: RasterLayer;
          rasterSource: RasterTileSource;
        };
      }
    ).__rasterLayerImageryZoomRegression = {
      engine,
      terrain,
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
      <div class="demo-status" id="status-output">启动中:raster-layer-imagery-zoom-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runRasterLayerImageryZoomRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
