import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { RasterLayer } from "../../../src/layers/RasterLayer";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";

describe("Imagery on Ellipsoid", () => {
  it("should display imagery without terrain", async () => {
    const container = document.createElement("div");
    const tile = document.createElement("canvas");
    tile.width = 256;
    tile.height = 256;
    const loadTile = vi.fn().mockResolvedValue(tile);
    const engine = new GlobeEngine({ container });

    engine.addSource("osm", new RasterTileSource({
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      loadTile
    }));
    await engine.waitForSource("osm");

    expect(engine.getDebugState().activeImageryTiles).toBeGreaterThan(0);
    expect(engine.getDebugState().visibleTiles).toBeGreaterThan(0);
    expect(engine.getDebugState().imageryRequestCount).toBeGreaterThan(0);
    expect(engine.getDebugState().imageryHostSwapCount).toBeGreaterThanOrEqual(0);
    expect(engine.getDebugState().imageryAncestorFallbackCount).toBeGreaterThanOrEqual(0);

    const autoLayer = engine.getLayer("__auto-imagery:osm");
    expect(autoLayer).toBeInstanceOf(RasterLayer);
    const autoStats = (autoLayer as RasterLayer).getDebugStats();
    expect(autoStats.hostSwapCount).toBeGreaterThanOrEqual(0);
    expect(autoStats.ancestorFallbackCount).toBeGreaterThanOrEqual(0);

    engine.dispose();
  });
});
