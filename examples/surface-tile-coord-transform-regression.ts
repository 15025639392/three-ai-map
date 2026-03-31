import "../src/styles.css";
import { BufferGeometry, Mesh } from "three";
import { GlobeEngine, TerrainTileLayer } from "../src";

interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

const FIXED_COORDINATE: TileCoordinate = { z: 2, x: 2, y: 1 };

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function createFlatElevationTile(): { width: number; height: number; data: Float32Array } {
  return {
    width: 4,
    height: 4,
    data: new Float32Array(16).fill(0)
  };
}

function getLayerMesh(engine: GlobeEngine, layerId: string): Mesh<BufferGeometry> | null {
  const group = engine.sceneSystem.scene.getObjectByName(layerId);
  if (!group) {
    return null;
  }

  const mesh = group.children.find((child) => {
    return "geometry" in child && child.userData !== undefined;
  }) as Mesh<BufferGeometry> | undefined;

  return mesh ?? null;
}

function computeMaxAbsDelta(left: ArrayLike<number>, right: ArrayLike<number>): number {
  const length = Math.min(left.length, right.length);
  let maxAbsDelta = 0;

  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs(Number(left[index]) - Number(right[index]));
    if (delta > maxAbsDelta) {
      maxAbsDelta = delta;
    }
  }

  return maxAbsDelta;
}

export function runSurfaceTileCoordTransformRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.noTransformTileKeys = "";
  container.dataset.transformTileKeys = "";
  container.dataset.positionDeltaMax = "";
  container.dataset.uvDeltaMax = "";
  container.dataset.tileKeyMatch = "";
  container.dataset.transformApplied = "";
  container.dataset.uvInvariant = "";
  container.dataset.allExpected = "";
  output.textContent = "启动中:surface-tile-coord-transform-regression";

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#05101a"
  });
  const sharedOptions = {
    terrain: {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium" as const,
      minZoom: FIXED_COORDINATE.z,
      maxZoom: FIXED_COORDINATE.z,
      tileSize: 256,
      cache: 4,
    },
    minMeshSegments: 4,
    maxMeshSegments: 4,
    skirtDepthMeters: 0,
    textureUvInsetPixels: 0,
    loadElevationTile: async () => createFlatElevationTile()
  };
  const noTransformLayer = new TerrainTileLayer("surface-coord-base", {
    ...sharedOptions
  });
  const transformLayer = new TerrainTileLayer("surface-coord-shifted", {
    ...sharedOptions,
    coordTransform: (lng, lat) => ({
      lng: lng + 0.15,
      lat: lat + 0.1
    })
  });

  const finalize = async (): Promise<void> => {
    engine.addLayer(noTransformLayer);
    await noTransformLayer.ready();
    engine.render();

    const noTransformMesh = getLayerMesh(engine, noTransformLayer.id);
    if (!noTransformMesh) {
      throw new Error("Missing coord-transform base mesh");
    }

    const noTransformPosition = noTransformMesh.geometry.getAttribute("position");
    const noTransformUv = noTransformMesh.geometry.getAttribute("uv");
    const noTransformTileKeys = noTransformLayer.getDebugStats().activeTileKeys.join(",");

    engine.removeLayer(noTransformLayer.id);
    engine.addLayer(transformLayer);
    await transformLayer.ready();
    engine.render();

    const transformMesh = getLayerMesh(engine, transformLayer.id);
    if (!transformMesh) {
      throw new Error("Missing coord-transform regression mesh");
    }

    const transformPosition = transformMesh.geometry.getAttribute("position");
    const transformUv = transformMesh.geometry.getAttribute("uv");

    const transformTileKeys = transformLayer.getDebugStats().activeTileKeys.join(",");
    const positionDeltaMax = computeMaxAbsDelta(noTransformPosition.array, transformPosition.array);
    const uvDeltaMax = computeMaxAbsDelta(noTransformUv.array, transformUv.array);
    const tileKeyMatch = noTransformTileKeys === transformTileKeys ? 1 : 0;
    const transformApplied = positionDeltaMax > 1e-6 ? 1 : 0;
    const uvInvariant = uvDeltaMax <= 1e-12 ? 1 : 0;
    const allExpected = tileKeyMatch === 1 && transformApplied === 1 && uvInvariant === 1 ? 1 : 0;

    container.dataset.phase = "after-surface-coord-transform";
    container.dataset.noTransformTileKeys = noTransformTileKeys;
    container.dataset.transformTileKeys = transformTileKeys;
    container.dataset.positionDeltaMax = `${positionDeltaMax}`;
    container.dataset.uvDeltaMax = `${uvDeltaMax}`;
    container.dataset.tileKeyMatch = `${tileKeyMatch}`;
    container.dataset.transformApplied = `${transformApplied}`;
    container.dataset.uvInvariant = `${uvInvariant}`;
    container.dataset.allExpected = `${allExpected}`;
    output.textContent = `after-surface-coord-transform:all=${allExpected}:delta=${positionDeltaMax.toFixed(6)}`;
  };

  engine.setView({ lng: 0, lat: 20, altitude: 2.3 });
  window.setTimeout(() => {
    void finalize();
  }, 120);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileCoordTransformRegression?: {
          engine: GlobeEngine;
          noTransformLayer: TerrainTileLayer;
          transformLayer: TerrainTileLayer;
        };
      }
    ).__surfaceTileCoordTransformRegression = {
      engine,
      noTransformLayer,
      transformLayer
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
      <div class="demo-status" id="status-output">启动中:surface-tile-coord-transform-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileCoordTransformRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
