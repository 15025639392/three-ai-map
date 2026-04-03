import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";

describe("PerformanceReport integration", () => {
  it("should expose baseline metrics used by task-5 baseline gates", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container, showDebugOverlay: true });

    engine.render();

    const report = engine.getPerformanceReport();
    expect(report.metrics.get("renderCount")?.value).toBeGreaterThanOrEqual(1);
    expect(report.metrics.get("cameraAltitude")?.value).toBeGreaterThan(0);
    expect(report.metrics.get("recoveryPolicyQueryCount")?.value).toBeGreaterThanOrEqual(0);
    expect(report.metrics.get("recoveryPolicyHitCount")?.value).toBeGreaterThanOrEqual(0);
    expect(report.metrics.get("recoveryPolicyRuleHitCount")?.value).toBeGreaterThanOrEqual(0);

    engine.dispose();
  });
});
