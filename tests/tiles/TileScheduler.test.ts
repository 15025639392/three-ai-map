import { TileScheduler } from "../../src/tiles/TileScheduler";

describe("TileScheduler", () => {
  it("deduplicates in-flight requests for the same tile key", async () => {
    const loader = vi.fn(async () => "tile");
    const scheduler = new TileScheduler<string>({
      concurrency: 2,
      loadTile: loader
    });

    const [first, second] = await Promise.all([
      scheduler.request("1/2/3", { z: 1, x: 2, y: 3 }),
      scheduler.request("1/2/3", { z: 1, x: 2, y: 3 })
    ]);

    expect(first).toBe("tile");
    expect(second).toBe("tile");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
