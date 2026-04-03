import { describe, expect, it, vi } from "vitest";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";

describe("RasterTileSource", () => {
  it("should cache repeated tile requests", async () => {
    const tile = document.createElement("canvas");
    const loadTile = vi.fn().mockResolvedValue(tile);
    const source = new RasterTileSource({
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      loadTile
    });

    const coordinate = { z: 0, x: 0, y: 0 };
    const first = await source.request(coordinate);
    const second = await source.request(coordinate);

    expect(first).toBe(tile);
    expect(second).toBe(tile);
    expect(loadTile).toHaveBeenCalledTimes(1);

    source.dispose();
  });
});
