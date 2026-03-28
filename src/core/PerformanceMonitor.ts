export interface Metric {
  name: string;
  value: number;
  timestamp: number;
}

export interface PerformanceReport {
  fps: number;
  averageFPS: number;
  frameTime: number;
  frameDrops: number;
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  metrics: Map<string, Metric>;
}

export class PerformanceMonitor {
  private frameCount: number = 0;
  private frameTimes: number[] = [];
  private frameDropCount: number = 0;
  private lastFrameTime: number = 0;
  private frameTimeThreshold: number = 33.33; // ~30 FPS threshold
  
  private metrics: Map<string, Metric> = new Map();
  
  private maxFrameSamples: number = 60;
  
  constructor() {
    this.lastFrameTime = performance.now();
  }
  
  update(deltaTime: number): void {
    this.frameCount++;
    this.frameTimes.push(deltaTime);
    
    if (this.frameTimes.length > this.maxFrameSamples) {
      this.frameTimes.shift();
    }
    
    // Detect frame drops (frames longer than threshold)
    if (deltaTime > this.frameTimeThreshold) {
      this.frameDropCount++;
    }
    
    this.lastFrameTime = performance.now();
  }
  
  getFPS(): number {
    if (this.frameTimes.length === 0) return 0;
    
    const avgFrameTime = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }
  
  getAverageFPS(): number {
    if (this.frameTimes.length === 0) return 0;
    
    const avgFrameTime = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }
  
  getFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes[this.frameTimes.length - 1];
  }
  
  getFrameDrops(): number {
    return this.frameDropCount;
  }
  
  getMemoryUsage(): {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | undefined {
    if (typeof (performance as any).memory === 'undefined') {
      return undefined;
    }
    
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit
    };
  }
  
  trackMetric(name: string, value: number): void {
    this.metrics.set(name, {
      name,
      value,
      timestamp: performance.now()
    });
  }
  
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }
  
  getAllMetrics(): Map<string, Metric> {
    return new Map(this.metrics);
  }
  
  reset(): void {
    this.frameCount = 0;
    this.frameTimes = [];
    this.frameDropCount = 0;
    this.lastFrameTime = performance.now();
    this.metrics.clear();
  }
  
  getReport(): PerformanceReport {
    return {
      fps: this.getFPS(),
      averageFPS: this.getAverageFPS(),
      frameTime: this.getFrameTime(),
      frameDrops: this.frameDropCount,
      memory: this.getMemoryUsage(),
      metrics: new Map(this.metrics)
    };
  }
  
  setMaxFrameSamples(samples: number): void {
    this.maxFrameSamples = samples;
    if (this.frameTimes.length > samples) {
      this.frameTimes = this.frameTimes.slice(-samples);
    }
  }
  
  setFrameDropThreshold(threshold: number): void {
    this.frameTimeThreshold = threshold;
  }
}
