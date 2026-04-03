import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { RasterLayer } from "../../../src/layers/RasterLayer";
import { RasterTileSource } from "../../../src/sources/RasterTileSource";

describe("Host imagery fallback", () => {
  it("should treat target-level solid-color recovery as fallback, not target-ready", async () => {
    const container = document.createElement("div");
    const sourceId = "fallback-imagery";
    const layerId = "fallback-imagery-layer";
    const fillRectSpy = vi.fn();
    const getContextMock = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        const context = {
          fillStyle: "",
          fillRect: fillRectSpy
        };

        return context as unknown as CanvasRenderingContext2D;
      });
    const engine = new GlobeEngine({
      container,
      showBaseGlobe: false,
      recoveryPolicy: {
        defaults: {
          imageryRetryAttempts: 0,
          imageryRetryDelayMs: 0,
          imageryFallbackColor: "#223344"
        }
      }
    });

    engine.addSource(sourceId, new RasterTileSource({
      tiles: ["memory://{z}/{x}/{y}.png"],
      tileSize: 64,
      minZoom: 0,
      maxZoom: 8,
      loadTile: async (coordinate) =>
        Promise.reject(new Error(`simulate target imagery failure at ${coordinate.z}/${coordinate.x}/${coordinate.y}`))
    }));
    engine.addLayer(new RasterLayer({ id: layerId, source: sourceId }));

    await engine.waitForSource(sourceId, { timeoutMs: 4000, pollIntervalMs: 16 });

    const layer = engine.getLayer(layerId) as RasterLayer;
    const stats = layer.getDebugStats();
    expect(stats.activeTileCount).toBeGreaterThan(0);
    expect(stats.ancestorFallbackCount).toBeGreaterThan(0);
    expect(engine.getDebugState().imageryAncestorFallbackCount).toBeGreaterThan(0);
    expect(getContextMock).toHaveBeenCalled();
    expect(fillRectSpy).toHaveBeenCalled();

    engine.dispose();
    getContextMock.mockRestore();
  });
});
