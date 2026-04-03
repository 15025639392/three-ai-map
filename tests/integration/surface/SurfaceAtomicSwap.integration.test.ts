import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { RasterLayer } from "../../../src/layers/RasterLayer";
import { TerrainTileLayer } from "../../../src/layers/TerrainTileLayer";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";
import { TerrainTileSource } from "../../../src/sources/TerrainTileSource";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createTileCanvas(): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  return tile;
}

function createFlatElevationTile(): { width: number; height: number; data: Float32Array } {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 0, 0])
  };
}

function extractHostKeyFromMeshName(name: string): string {
  const parts = name.split(":");
  return parts.length >= 3 ? parts[1] : name;
}

function collectHostKeys(engine: GlobeEngine, layerId: string): string[] {
  const rasterGroup = engine.sceneSystem.scene.getObjectByName(layerId);
  const meshNames = (rasterGroup?.children ?? []).map((child) => child.name);
  return meshNames.map(extractHostKeyFromMeshName).sort();
}

describe("Surface atomic swap", () => {
  it("should keep one final visible imagery mesh per host tile during host replacement", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1280 });
    Object.defineProperty(container, "clientHeight", { value: 720 });
    const loadTile = vi.fn(async (coordinate: { z: number }) => {
      if (coordinate.z >= 2) {
        await sleep(24);
      }
      return createTileCanvas();
    });
    const engine = new GlobeEngine({ container, showBaseGlobe: false });
    const sourceId = "swap-imagery";
    const layerId = "swap-imagery-layer";
    const terrainSourceId = "swap-terrain";
    const terrainLayerId = "swap-terrain-layer";

    engine.addSource(terrainSourceId, new TerrainTileSource(terrainSourceId, {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      tileSize: 64,
      minZoom: 0,
      maxZoom: 2,
      loadTile: async () => createFlatElevationTile()
    }));
    engine.addLayer(new TerrainTileLayer(terrainLayerId, {
      source: terrainSourceId,
      minMeshSegments: 2,
      maxMeshSegments: 2
    }));

    engine.addSource(sourceId, new RasterTileSource({
      tiles: ["memory://{z}/{x}/{y}.png"],
      tileSize: 64,
      minZoom: 0,
      maxZoom: 2,
      loadTile
    }));
    engine.addLayer(new RasterLayer({ id: layerId, source: sourceId }));
    engine.setView({ lng: 0, lat: 0, altitude: 8 });
    await engine.waitForSource(sourceId, { timeoutMs: 4000, pollIntervalMs: 16 });
    const beforeHostKeys = collectHostKeys(engine, layerId);
    expect(beforeHostKeys.length).toBeGreaterThan(0);

    engine.setView({
      lng: 118.212890625,
      lat: 39.571789134975425,
      altitude: 0.01
    });

    const startedAt = performance.now();
    let hostKeysChanged = false;
    while (performance.now() - startedAt < 4000) {
      engine.render();
      const layer = engine.getLayer(layerId) as RasterLayer;
      const currentHostKeys = collectHostKeys(engine, layerId);
      hostKeysChanged =
        currentHostKeys.length > 0 &&
        (
          currentHostKeys.length !== beforeHostKeys.length ||
          currentHostKeys.some((key, index) => key !== beforeHostKeys[index])
        );
      if (layer.getDebugStats().hostSwapCount > 0 || hostKeysChanged) {
        break;
      }
      await sleep(16);
    }

    const layer = engine.getLayer(layerId) as RasterLayer;
    const stats = layer.getDebugStats();
    expect(stats.activeTileCount).toBeGreaterThan(0);
    expect(stats.hostSwapCount > 0 || hostKeysChanged).toBe(true);

    const hostKeys = collectHostKeys(engine, layerId);
    const uniqueHostKeys = new Set(hostKeys);
    expect(uniqueHostKeys.size).toBe(hostKeys.length);

    engine.dispose();
  });
});
