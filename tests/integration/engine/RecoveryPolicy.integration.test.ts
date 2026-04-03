import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";
import { Layer, type LayerContext } from "../../../src/layers/Layer";

class RecoveryProbeLayer extends Layer {
  onAdd(context: LayerContext): void {
    context.resolveRecovery?.({
      layerId: this.id,
      stage: "tile-load",
      category: "network",
      severity: "warn"
    });
    context.resolveRecovery?.({
      layerId: this.id,
      stage: "tile-load",
      category: "network",
      severity: "warn"
    });
    context.resolveRecovery?.({
      layerId: this.id,
      stage: "tile-parse",
      category: "data",
      severity: "warn"
    });
  }
}

describe("RecoveryPolicy integration", () => {
  it("should expose stage counters through a unified API and sync debug/perf metrics", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({
      container,
      recoveryPolicy: {
        defaults: {
          imageryRetryAttempts: 1
        },
        rules: [
          {
            stage: "tile-load",
            category: "network",
            severity: "warn",
            overrides: {
              elevationRetryAttempts: 2
            }
          }
        ]
      }
    });
    const layer = new RecoveryProbeLayer("recovery-probe");

    engine.addLayer(layer);
    engine.render();

    const tileLoadStats = engine.getRecoveryPolicyStats("tile-load");
    const tileParseStats = engine.getRecoveryPolicyStats("tile-parse");
    const debugState = engine.getDebugState();
    const report = engine.getPerformanceReport();

    expect(tileLoadStats.queryCount).toBe(2);
    expect(tileLoadStats.hitCount).toBe(2);
    expect(tileLoadStats.ruleHitCount).toBe(2);
    expect(tileParseStats.queryCount).toBe(1);
    expect(tileParseStats.hitCount).toBe(1);
    expect(tileParseStats.ruleHitCount).toBe(0);
    expect(debugState.recoveryPolicyQueryCount).toBe(3);
    expect(debugState.recoveryPolicyHitCount).toBe(3);
    expect(debugState.recoveryPolicyRuleHitCount).toBe(2);
    expect(report.metrics.get("recoveryPolicyQueryCount:tile-load")?.value).toBe(2);
    expect(report.metrics.get("recoveryPolicyHitCount:tile-load")?.value).toBe(2);
    expect(report.metrics.get("recoveryPolicyRuleHitCount:tile-load")?.value).toBe(2);

    engine.dispose();
  });
});
