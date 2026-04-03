import { describe, expect, it } from "vitest";
import {
  buildTerrainFillStats,
  buildTileSkirtMaskFromAdjacency
} from "../../../src/surface/TerrainFillMesh";
import type { SurfaceTileAdjacency } from "../../../src/surface/SurfaceAdjacency";

describe("TerrainFillMesh", () => {
  it("should build fill statistics from mixed adjacency", () => {
    const adjacencyByKey = new Map<string, SurfaceTileAdjacency>();
    adjacencyByKey.set("4/8/5", {
      top: null,
      right: { key: "4/9/5", lodDelta: 0 },
      bottom: { key: "3/4/3", lodDelta: 1 },
      left: { key: "5/14/10", lodDelta: -1 }
    });

    const stats = buildTerrainFillStats(["4/8/5"], adjacencyByKey);

    expect(stats.fillEdgeCount).toBe(3);
    expect(stats.fillCornerCount).toBeGreaterThanOrEqual(1);
    expect(stats.maxNeighborLodDelta).toBe(1);
    expect(stats.crackDetectedCount).toBe(1);
  });

  it("should disable skirt only when neighbor exists at same lod", () => {
    const mask = buildTileSkirtMaskFromAdjacency({
      top: { key: "4/8/4", lodDelta: 0 },
      right: null,
      bottom: { key: "3/4/3", lodDelta: 1 },
      left: { key: "5/14/10", lodDelta: -1 }
    });

    expect(mask.top).toBe(false);
    expect(mask.right).toBe(true);
    expect(mask.bottom).toBe(true);
    expect(mask.left).toBe(true);
  });

  it("should count level-1 lod difference as crack risk", () => {
    const adjacencyByKey = new Map<string, SurfaceTileAdjacency>();
    adjacencyByKey.set("4/8/5", {
      top: { key: "4/8/4", lodDelta: 0 },
      right: { key: "4/9/5", lodDelta: 0 },
      bottom: { key: "3/4/3", lodDelta: 1 },
      left: { key: "4/7/5", lodDelta: 0 }
    });

    const stats = buildTerrainFillStats(["4/8/5"], adjacencyByKey);

    expect(stats.fillEdgeCount).toBe(1);
    expect(stats.maxNeighborLodDelta).toBe(1);
    expect(stats.crackDetectedCount).toBe(1);
  });
});
