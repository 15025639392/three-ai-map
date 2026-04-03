import { describe, expect, it } from "vitest";
import { TileCache } from "../../../src/core/TileCache";

describe("TileCache", () => {
  it("should store and evict entries by key", () => {
    const cache = new TileCache<string>();

    cache.set("0/0/0", "tile");
    expect(cache.get("0/0/0")).toBe("tile");

    cache.evict("0/0/0");
    expect(cache.get("0/0/0")).toBeNull();
  });
});
