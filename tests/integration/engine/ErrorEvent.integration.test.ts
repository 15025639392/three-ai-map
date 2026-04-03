import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { VectorTileLayer } from "../../../src/layers/VectorTileLayer";

describe("Error event integration", () => {
  it("should preserve severity semantics for unknown vector tile set failures", async () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });
    const vectorLayer = new VectorTileLayer({
      url: "memory://{z}/{x}/{y}.pbf"
    });
    const onError = vi.fn();

    engine.on("error", onError);
    engine.addLayer(vectorLayer);

    (vectorLayer as unknown as { parseTileWithRecovery: () => Promise<never> }).parseTileWithRecovery =
      async () => {
        throw new Error("unexpected tile-set failure");
      };

    await expect(vectorLayer.setTileData(new Uint8Array([0x1a]), 0, 0, 0)).rejects.toThrow(
      "unexpected tile-set failure"
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const payload = onError.mock.calls[0][0];
    expect(payload.source).toBe("layer");
    expect(payload.layerId).toBe(vectorLayer.id);
    expect(payload.stage).toBe("tile-set");
    expect(payload.category).toBe("unknown");
    expect(payload.severity).toBe("error");
    expect(payload.recoverable).toBe(false);
    expect(engine.getDebugState().errorCount).toBe(1);

    engine.dispose();
  });
});
