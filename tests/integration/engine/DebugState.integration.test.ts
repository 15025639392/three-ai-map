import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";

describe("DebugState", () => {
  it("should expose performance counters on debug state", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });

    engine.render();
    const debugState = engine.getDebugState();

    expect(debugState.fps).toBeGreaterThanOrEqual(0);
    expect(debugState.frameTimeMs).toBeGreaterThanOrEqual(0);
    expect(debugState.activeTerrainTiles).toBeGreaterThanOrEqual(0);
    expect(debugState.terrainRequestCount).toBeGreaterThanOrEqual(0);
    expect(debugState.terrainDecodeFallbackCount).toBeGreaterThanOrEqual(0);
    expect(debugState.errorCount).toBeGreaterThanOrEqual(0);
    expect(debugState.recoveryPolicyQueryCount).toBeGreaterThanOrEqual(0);
    expect(debugState.recoveryPolicyHitCount).toBeGreaterThanOrEqual(0);
    expect(debugState.recoveryPolicyRuleHitCount).toBeGreaterThanOrEqual(0);

    engine.dispose();
  });
});
