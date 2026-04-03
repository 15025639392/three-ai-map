import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { RasterLayer } from "../../../src/layers/RasterLayer";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";

function createTileCanvas(): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  return tile;
}

function extractHostKeyFromMeshName(name: string): string {
  const parts = name.split(":");
  return parts.length >= 3 ? parts[1] : name;
}

describe("Surface atomic swap", () => {
  it("should keep one final visible imagery mesh per host tile", async () => {
    const container = document.createElement("div");
    const loadTile = vi.fn(async () => createTileCanvas());
    const engine = new GlobeEngine({ container, showBaseGlobe: false });
    const sourceId = "swap-imagery";
    const layerId = "swap-imagery-layer";

    engine.addSource(sourceId, new RasterTileSource({
      tiles: ["memory://{z}/{x}/{y}.png"],
      tileSize: 64,
      minZoom: 0,
      maxZoom: 8,
      loadTile
    }));
    engine.addLayer(new RasterLayer({ id: layerId, source: sourceId }));
    await engine.waitForSource(sourceId, { timeoutMs: 4000, pollIntervalMs: 16 });

    const layer = engine.getLayer(layerId) as RasterLayer;
    const stats = layer.getDebugStats();
    expect(stats.activeTileCount).toBeGreaterThan(0);
    expect(stats.hostSwapCount).toBeGreaterThanOrEqual(0);

    const rasterGroup = engine.sceneSystem.scene.getObjectByName(layerId);
    const meshNames = (rasterGroup?.children ?? []).map((child) => child.name);
    const hostKeys = meshNames.map(extractHostKeyFromMeshName);
    const uniqueHostKeys = new Set(hostKeys);
    expect(uniqueHostKeys.size).toBe(hostKeys.length);

    engine.dispose();
  });
});
