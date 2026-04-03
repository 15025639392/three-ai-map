import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { TerrainTileLayer } from "../../../src/layers/TerrainTileLayer";
import { TerrainTileSource, type ElevationTileData } from "../../../src/sources/TerrainTileSource";
import { buildSurfaceAdjacencyMap } from "../../../src/surface/SurfaceAdjacency";
import { buildTerrainFillStats } from "../../../src/surface/TerrainFillMesh";
import type { TileCoordinate } from "../../../src/tiles/TileViewport";

function createFlatElevationTile(height = 0): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([height, height, height, height])
  };
}

describe("Surface crack stability", () => {
  it("should expose fill and crack counters using the actual display host set", async () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });
    const sourceId = "surface-crack-terrain";
    const source = new TerrainTileSource(sourceId, {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 2,
      maxZoom: 8,
      loadTile: async (coordinate) => {
        if (coordinate.z <= 2) {
          return createFlatElevationTile((coordinate.z - 2) * 10);
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 160);
        });
        return createFlatElevationTile((coordinate.z - 2) * 10);
      }
    });
    const terrain = new TerrainTileLayer("surface-crack-terrain-layer", {
      source: sourceId,
      minMeshSegments: 2,
      maxMeshSegments: 2,
      skirtDepthMeters: 0,
      elevationExaggeration: 0
    });

    engine.addSource(sourceId, source);
    engine.addLayer(terrain);
    engine.setView({ lng: 8, lat: 28, altitude: 2.8 });
    await terrain.ready();
    engine.render();
    engine.setView({ lng: 8, lat: 28, altitude: 1.05 });
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 10);
    });
    engine.render();

    const stats = terrain.getDebugStats();
    const displayCoordinates: TileCoordinate[] = stats.activeTileKeys.map((key) => {
      const [z, x, y] = key.split("/").map((value) => Number.parseInt(value, 10));
      return { z, x, y };
    });
    const expectedFromDisplay = buildTerrainFillStats(
      stats.activeTileKeys,
      buildSurfaceAdjacencyMap(displayCoordinates)
    );

    expect(stats.activeTileCount).toBeGreaterThan(1);
    expect(stats.fillEdgeCount).toBe(expectedFromDisplay.fillEdgeCount);
    expect(stats.fillCornerCount).toBe(expectedFromDisplay.fillCornerCount);
    expect(stats.maxNeighborLodDelta).toBe(expectedFromDisplay.maxNeighborLodDelta);
    expect(stats.crackDetectedCount).toBe(expectedFromDisplay.crackDetectedCount);

    engine.dispose();
  });
});
