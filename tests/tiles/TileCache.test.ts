import { TileCache } from "../../src/tiles/TileCache";

describe("TileCache", () => {
  it("evicts the least recently used tile when capacity is exceeded", () => {
    const cache = new TileCache<string>(2);

    cache.set("0/0/0", "a");
    cache.set("0/0/1", "b");
    cache.get("0/0/0");
    cache.set("0/1/0", "c");

    expect(cache.get("0/0/0")).toBe("a");
    expect(cache.get("0/0/1")).toBeUndefined();
    expect(cache.get("0/1/0")).toBe("c");
  });
});
