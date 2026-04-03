import { describe, expect, it } from "vitest";
import { QuadtreeLOD } from "../../../src/tiles/QuadtreeLOD";

describe("QuadtreeLOD", () => {
  it("should refine near tiles and keep far tiles", () => {
    const lod = new QuadtreeLOD({ maximumScreenSpaceError: 8 });
    const nearSse = lod.calculateSSE({
      geometricError: 1000,
      distance: 10000,
      screenHeight: 1080
    });
    const farSse = lod.calculateSSE({
      geometricError: 1000,
      distance: 1000000,
      screenHeight: 1080
    });

    expect(nearSse).toBeGreaterThan(farSse);
  });
});
