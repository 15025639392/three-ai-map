import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { RasterLayer } from "../../../src/layers/RasterLayer";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";
import type { TileCoordinate } from "../../../src/tiles/TileViewport";

function createTileCanvas(coordinate: TileCoordinate): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  tile.dataset.coordinate = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;

  return tile;
}

describe("Host imagery fallback", () => {
  it("should fallback to ancestor imagery when target-level requests fail", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1024 });
    Object.defineProperty(container, "clientHeight", { value: 768 });
    const sourceId = "fallback-imagery";
    const layerId = "fallback-imagery-layer";
    const engine = new GlobeEngine({
      container,
      showBaseGlobe: false,
      recoveryPolicy: {
        defaults: {
          imageryRetryAttempts: 0,
          imageryRetryDelayMs: 0
        }
      }
    });

    engine.addSource(sourceId, new RasterTileSource({
      tiles: ["memory://{z}/{x}/{y}.png"],
      tileSize: 64,
      minZoom: 0,
      maxZoom: 8,
      loadTile: async (coordinate) => {
        if (coordinate.z > 0) {
          throw new Error(`simulate target imagery failure at ${coordinate.z}/${coordinate.x}/${coordinate.y}`);
        }

        return createTileCanvas(coordinate);
      }
    }));
    engine.addLayer(new RasterLayer({ id: layerId, source: sourceId }));

    await engine.waitForSource(sourceId, { timeoutMs: 4000, pollIntervalMs: 16 });

    const layer = engine.getLayer(layerId) as RasterLayer;
    const stats = layer.getDebugStats();
    expect(stats.activeTileCount).toBeGreaterThan(0);
    expect(stats.ancestorFallbackCount).toBeGreaterThan(0);

    engine.dispose();
  });
});
