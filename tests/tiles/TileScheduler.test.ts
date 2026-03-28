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

  it("rejects queued requests when clear() is called", async () => {
    let resolveFirst!: (value: string) => void;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const scheduler = new TileScheduler<string>({
      concurrency: 1,
      loadTile: loader
    });

    const first = scheduler.request("0/0/0", { z: 0, x: 0, y: 0 });
    const second = scheduler.request("0/0/1", { z: 0, x: 0, y: 1 });

    scheduler.clear();
    resolveFirst("tile");
    await first;
    await expect(second).rejects.toThrow("TileScheduler cleared");

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
