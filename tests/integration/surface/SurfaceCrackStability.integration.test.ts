import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { TerrainTileLayer } from "../../../src/layers/TerrainTileLayer";
import { TerrainTileSource, type ElevationTileData } from "../../../src/sources/TerrainTileSource";

function createFlatElevationTile(): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 0, 0])
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
      loadTile: async () => createFlatElevationTile()
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
    engine.setView({ lng: 8, lat: 28, altitude: 1.3 });
    await terrain.ready();
    engine.render();

    const stats = terrain.getDebugStats();
    expect(stats.fillEdgeCount).toBeGreaterThanOrEqual(0);
    expect(stats.fillCornerCount).toBeGreaterThanOrEqual(0);
    expect(stats.maxNeighborLodDelta).toBeGreaterThanOrEqual(0);
    expect(stats.crackDetectedCount).toBeGreaterThanOrEqual(0);

    engine.dispose();
  });
});
