import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { TerrainTileLayer } from "../../../src/layers/TerrainTileLayer";
import { TerrainTileSource, type ElevationTileData } from "../../../src/sources/TerrainTileSource";

function createFlatElevationTile(height = 0): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([height, height, height, height])
  };
}

describe("Surface crack stability", () => {
  it("should expose fill and crack counters on terrain debug stats", async () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });
    const sourceId = "surface-crack-terrain";
    const source = new TerrainTileSource(sourceId, {
      tiles: ["memory://{z}/{x}/{y}.png"],
      encode: "terrarium",
      minZoom: 2,
      maxZoom: 8,
      loadTile: async (coordinate) => createFlatElevationTile((coordinate.z - 2) * 10)
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
    engine.setView({ lng: 8, lat: 28, altitude: 1.05 });
    await terrain.ready();
    engine.render();

    const stats = terrain.getDebugStats();
    expect(stats.activeTileCount).toBeGreaterThan(1);
    expect(stats.fillEdgeCount).toBeGreaterThan(0);
    expect(stats.fillCornerCount).toBeGreaterThan(0);
    expect(stats.maxNeighborLodDelta).toBe(1);
    expect(stats.crackDetectedCount).toBeGreaterThanOrEqual(2);

    engine.dispose();
  });
});
