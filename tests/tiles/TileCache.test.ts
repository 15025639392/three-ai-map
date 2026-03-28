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

  it("calls onEvict callback when a tile is evicted", () => {
    const evicted: Array<{ key: string; value: string }> = [];
    const cache = new TileCache<string>(2, {
      onEvict: (key, value) => evicted.push({ key, value })
    });

    cache.set("0/0/0", "a");
    cache.set("0/0/1", "b");
    cache.set("0/1/0", "c");

    expect(evicted).toEqual([{ key: "0/0/0", value: "a" }]);
  });

  it("evicts multiple entries when capacity is exceeded by more than one", () => {
    const evicted: string[] = [];
    const cache = new TileCache<string>(2, {
      onEvict: (key) => evicted.push(key)
    });

    cache.set("0/0/0", "a");
    cache.set("0/0/1", "b");
    cache.set("0/1/0", "c");
    cache.set("0/1/1", "d");

    expect(cache.get("0/0/0")).toBeUndefined();
    expect(cache.get("0/0/1")).toBeUndefined();
    expect(cache.get("0/1/0")).toBe("c");
    expect(cache.get("0/1/1")).toBe("d");
    expect(evicted).toEqual(["0/0/0", "0/0/1"]);
  });
});
