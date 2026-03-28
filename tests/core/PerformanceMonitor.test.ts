import { describe, it, expect, vi } from 'vitest';
import { PerformanceMonitor } from '../../src/core/PerformanceMonitor';

describe('PerformanceMonitor', () => {
  it('creates a performance monitor', () => {
    const monitor = new PerformanceMonitor();
    expect(monitor).toBeDefined();
  });

  it('measures FPS', () => {
    const monitor = new PerformanceMonitor();
    monitor.update(16.67); // ~60 FPS
    const fps = monitor.getFPS();
    
    expect(fps).toBeGreaterThan(0);
    expect(fps).toBeLessThan(100);
  });

  it('calculates average FPS over time', () => {
    const monitor = new PerformanceMonitor();
    
    // Simulate 60 frames at 60 FPS
    for (let i = 0; i < 60; i++) {
      monitor.update(16.67);
    }
    
    const avgFPS = monitor.getAverageFPS();
    expect(avgFPS).toBeCloseTo(60, 1);
  });

  it('measures frame time', () => {
    const monitor = new PerformanceMonitor();
    monitor.update(16.67);
    const frameTime = monitor.getFrameTime();
    
    expect(frameTime).toBeCloseTo(16.67, 1);
  });

  it('detects frame drops', () => {
    const monitor = new PerformanceMonitor();
    
    // Normal frames
    for (let i = 0; i < 10; i++) {
      monitor.update(16.67);
    }
    
    // Frame drop
    monitor.update(100); // Slow frame
    
    const frameDrops = monitor.getFrameDrops();
    expect(frameDrops).toBeGreaterThan(0);
  });

  it('measures memory usage', () => {
    const monitor = new PerformanceMonitor();
    const memory = monitor.getMemoryUsage();
    
    // Memory API may not be available in all browsers
    if (typeof (performance as any).memory !== 'undefined') {
      expect(memory).toBeDefined();
      expect(memory!.usedJSHeapSize).toBeGreaterThan(0);
    } else {
      expect(memory).toBeUndefined();
    }
  });

  it('tracks custom metrics', () => {
    const monitor = new PerformanceMonitor();
    
    monitor.trackMetric('tileCount', 100);
    monitor.trackMetric('tileCount', 150);
    
    const metric = monitor.getMetric('tileCount');
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(150);
  });

  it('resets metrics', () => {
    const monitor = new PerformanceMonitor();
    
    monitor.update(16.67);
    monitor.reset();
    
    const fps = monitor.getFPS();
    expect(fps).toBe(0);
  });

  it('generates performance report', () => {
    const monitor = new PerformanceMonitor();
    
    for (let i = 0; i < 60; i++) {
      monitor.update(16.67);
    }
    
    const report = monitor.getReport();
    expect(report).toBeDefined();
    expect(report.fps).toBeDefined();
    expect(report.averageFPS).toBeDefined();
    expect(report.frameTime).toBeDefined();
  });
});
