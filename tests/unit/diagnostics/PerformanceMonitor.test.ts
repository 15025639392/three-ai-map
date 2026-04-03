import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../../src/diagnostics/PerformanceMonitor";

describe("PerformanceMonitor", () => {
  it("should expose fps and frame time counters", () => {
    const monitor = new PerformanceMonitor();
    monitor.beginFrame();
    monitor.endFrame();

    const metrics = monitor.getMetrics();
    expect(metrics.fps).toBeGreaterThanOrEqual(0);
    expect(metrics.frameTimeMs).toBeGreaterThanOrEqual(0);
  });
});
