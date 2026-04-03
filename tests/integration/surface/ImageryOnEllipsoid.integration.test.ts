import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
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

    engine.dispose();
  });
});
