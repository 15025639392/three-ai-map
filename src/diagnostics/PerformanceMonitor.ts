import {
  PerformanceMonitor as CorePerformanceMonitor,
  type Metric,
  type PerformanceReport
} from "../core/PerformanceMonitor";

export type { Metric, PerformanceReport };

export interface PerformanceMetrics {
  fps: number;
  frameTimeMs: number;
}

export class PerformanceMonitor extends CorePerformanceMonitor {
  private lastFrameStartedAt = 0;

  beginFrame(): void {
    this.lastFrameStartedAt = performance.now();
  }

  endFrame(): void {
    const frameTimeMs = Math.max(0, performance.now() - this.lastFrameStartedAt);
    this.update(frameTimeMs);
  }

  getMetrics(): PerformanceMetrics {
    return {
      fps: this.getFPS(),
      frameTimeMs: this.getFrameTime()
    };
  }
}
