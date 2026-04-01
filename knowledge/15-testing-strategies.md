# 15 Testing Strategies

## 1. 目标与边界

本章解决地球引擎的测试策略问题：

1. 如何设计分层测试体系
2. 如何实现回归测试和性能基准
3. 如何测试WebGL和Worker相关代码

本章聚焦测试策略，不讨论具体业务逻辑。

---

## 2. 测试金字塔

### 2.1 测试层次

**单元测试**（Unit Tests）：
- 测试单个函数或类
- 快速执行，无外部依赖
- 覆盖率目标：80%+

**集成测试**（Integration Tests）：
- 测试模块间交互
- 可能包含外部依赖（如网络请求）
- 覆盖率目标：60%+

**端到端测试**（E2E Tests）：
- 测试完整用户场景
- 使用真实浏览器环境
- 覆盖率目标：关键路径100%

### 2.2 测试配置

**vitest.config.ts**：
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",      // 使用jsdom模拟浏览器环境
    globals: true,             // 全局API（如describe、it）
    include: ["tests/**/*.test.ts"]  // 测试文件匹配模式
  }
});
```

---

## 3. 单元测试

### 3.1 数学函数测试

```typescript
// tests/spatial/SpatialMath.test.ts
import { describe, it, expect } from 'vitest';
import { haversineDistance, greatCircleDistance } from '../../src/spatial/SpatialMath';

describe('SpatialMath', () => {
  describe('haversineDistance', () => {
    it('should calculate distance between two points correctly', () => {
      const p1 = { lng: 0, lat: 0 };
      const p2 = { lng: 1, lat: 1 };
      
      const distance = haversineDistance(p1, p2);
      
      // 验证距离在合理范围内
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(200000);  // 约157km
    });
    
    it('should return 0 for same point', () => {
      const p = { lng: 116.3975, lat: 39.9085 };
      
      const distance = haversineDistance(p, p);
      
      expect(distance).toBe(0);
    });
  });
});
```

### 3.2 瓦片调度测试

```typescript
// tests/tiles/TileScheduler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TileScheduler } from '../../src/tiles/TileScheduler';

describe('TileScheduler', () => {
  it('should respect concurrency limit', async () => {
    const loadTile = vi.fn().mockResolvedValue({});
    const scheduler = new TileScheduler({
      concurrency: 2,
      loadTile
    });
    
    // 发起4个请求
    scheduler.request('tile1', {});
    scheduler.request('tile2', {});
    scheduler.request('tile3', {});
    scheduler.request('tile4', {});
    
    // 等待所有请求完成
    await scheduler.waitForAll();
    
    // 验证并发数限制
    expect(loadTile).toHaveBeenCalledTimes(4);
    // 验证最多同时有2个请求在执行
    // （需要更复杂的mock来验证）
  });
  
  it('should deduplicate requests', async () => {
    const loadTile = vi.fn().mockResolvedValue({});
    const scheduler = new TileScheduler({
      concurrency: 4,
      loadTile
    });
    
    // 发起相同key的请求
    const promise1 = scheduler.request('tile1', {});
    const promise2 = scheduler.request('tile1', {});
    
    await Promise.all([promise1, promise2]);
    
    // 验证只调用了一次loadTile
    expect(loadTile).toHaveBeenCalledTimes(1);
  });
});
```

---

## 4. 集成测试

### 4.1 图层集成测试

```typescript
// tests/layers/RasterLayer.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GlobeEngine } from '../../src/engine/GlobeEngine';
import { RasterLayer } from '../../src/layers/RasterLayer';
import { RasterTileSource } from '../../src/sources/RasterTileSource';

describe('RasterLayer Integration', () => {
  let engine: GlobeEngine;
  
  beforeEach(() => {
    // 创建测试容器
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    // 创建引擎
    engine = new GlobeEngine({ container });
  });
  
  it('should load and display raster tiles', async () => {
    // 添加数据源
    engine.addSource('osm', new RasterTileSource('osm', {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      minZoom: 0,
      maxZoom: 19
    }));
    
    // 添加图层
    engine.addLayer(new RasterLayer({
      id: 'osm-layer',
      source: 'osm'
    }));
    
    // 等待图层加载
    await engine.waitForLayer('osm-layer');
    
    // 验证图层已添加
    expect(engine.getLayer('osm-layer')).toBeDefined();
  });
});
```

### 4.2 引擎集成测试

```typescript
// tests/engine/GlobeEngine.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GlobeEngine } from '../../src/engine/GlobeEngine';

describe('GlobeEngine Integration', () => {
  let engine: GlobeEngine;
  
  beforeEach(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    engine = new GlobeEngine({ container });
  });
  
  it('should initialize correctly', () => {
    expect(engine).toBeDefined();
    expect(engine.radius).toBe(1);
  });
  
  it('should handle view changes', () => {
    engine.setView({ lng: 116.3975, lat: 39.9085, altitude: 1000000 });
    
    const view = engine.getView();
    expect(view.lng).toBeCloseTo(116.3975, 2);
    expect(view.lat).toBeCloseTo(39.9085, 2);
  });
});
```

---

## 5. 端到端测试

### 5.1 浏览器测试配置

**package.json脚本**：
```json
{
  "scripts": {
    "test:browser:surface-tiles": "npm run build && node scripts/browser-smoke-surface-tile-regression.mjs",
    "test:browser:camera-interaction": "npm run build && node scripts/browser-smoke-camera-interaction.mjs",
    "test:browser:gaode-pan": "npm run build && node scripts/browser-smoke-gaode-pan.mjs"
  }
}
```

### 5.2 回归测试脚本

**scripts/browser-smoke-surface-tile-regression.mjs**：
```javascript
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function runRegressionTest() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // 导航到测试页面
  await page.goto('http://localhost:3000/examples/surface-tile-regression.html');
  
  // 等待渲染完成
  await page.waitForTimeout(3000);
  
  // 截图
  const screenshot = await page.screenshot();
  writeFileSync('test-results/surface-tile-regression.png', screenshot);
  
  // 收集性能指标
  const metrics = await page.evaluate(() => {
    return {
      fps: window.performanceMetrics?.fps,
      tileCount: window.performanceMetrics?.tileCount,
      memoryUsage: window.performance?.memory?.usedJSHeapSize
    };
  });
  
  writeFileSync(
    'test-results/surface-tile-regression-metrics.json',
    JSON.stringify(metrics, null, 2)
  );
  
  await browser.close();
}

runRegressionTest().catch(console.error);
```

---

## 6. 性能基准测试

### 6.1 性能指标收集

```typescript
// tests/performance/PerformanceBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { GlobeEngine } from '../../src/engine/GlobeEngine';

describe('Performance Benchmark', () => {
  it('should maintain 60fps during pan', async () => {
    const container = document.createElement('div');
    const engine = new GlobeEngine({ container });
    
    // 开始性能监控
    const metrics: number[] = [];
    engine.on('frame', () => {
      metrics.push(engine.getPerformanceMetrics().fps);
    });
    
    // 执行平移操作
    for (let i = 0; i < 100; i++) {
      engine.pan(10, 0);
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    
    // 计算平均帧率
    const avgFps = metrics.reduce((a, b) => a + b, 0) / metrics.length;
    
    expect(avgFps).toBeGreaterThan(55);  // 允许一定波动
  });
});
```

### 6.2 性能基线配置

**scripts/map-engine-metrics-baseline.config.json**：
```json
{
  "fps": {
    "min": 55,
    "target": 60
  },
  "tileLoadTime": {
    "max": 100,
    "target": 50
  },
  "memoryUsage": {
    "max": 500000000,
    "target": 200000000
  }
}
```

---

## 7. WebGL测试

### 7.1 WebGL上下文模拟

```typescript
// tests/setup/webgl-mock.ts
import { vi } from 'vitest';

// 模拟WebGL上下文
const mockWebGLContext = {
  getExtension: vi.fn(),
  getParameter: vi.fn(),
  createShader: vi.fn(),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(),
  createProgram: vi.fn(),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(),
  useProgram: vi.fn(),
  createBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  drawArrays: vi.fn(),
  drawElements: vi.fn()
};

// 模拟HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn((contextType) => {
  if (contextType === 'webgl' || contextType === 'webgl2') {
    return mockWebGLContext;
  }
  return null;
});
```

### 7.2 渲染测试

```typescript
// tests/rendering/WebGL.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RendererSystem } from '../../src/core/RendererSystem';

describe('WebGL Rendering', () => {
  let renderer: RendererSystem;
  
  beforeEach(() => {
    const container = document.createElement('div');
    renderer = new RendererSystem({ container });
  });
  
  it('should create WebGL context', () => {
    expect(renderer.renderer).toBeDefined();
    expect(renderer.renderer.getContext()).toBeDefined();
  });
  
  it('should handle resize', () => {
    renderer.setSize(1024, 768);
    
    const canvas = renderer.renderer.domElement;
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });
});
```

---

## 8. Worker测试

### 8.1 Worker测试配置

```typescript
// tests/workers/Worker.test.ts
import { describe, it, expect } from 'vitest';

describe('Terrarium Decode Worker', () => {
  it('should decode terrarium data correctly', async () => {
    // 创建测试数据
    const width = 256;
    const height = 256;
    const buffer = new ArrayBuffer(width * height * 4);
    const pixels = new Uint8ClampedArray(buffer);
    
    // 填充测试数据
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 128;     // R
      pixels[i + 1] = 0;   // G
      pixels[i + 2] = 0;   // B
      pixels[i + 3] = 255; // A
    }
    
    // 创建Worker
    const worker = new Worker(
      new URL('../../src/workers/terrariumDecodeWorker.ts', import.meta.url),
      { type: 'module' }
    );
    
    // 发送消息并等待响应
    const result = await new Promise<Float32Array>((resolve) => {
      worker.onmessage = (event) => {
        resolve(new Float32Array(event.data.buffer));
      };
      
      worker.postMessage({
        id: 1,
        encoding: 'terrarium',
        width,
        height,
        buffer
      }, [buffer]);
    });
    
    // 验证解码结果
    expect(result.length).toBe(width * height);
    expect(result[0]).toBeCloseTo(-32640, 0);  // 128 * 256 - 32768
    
    worker.terminate();
  });
});
```

---

## 9. 测试覆盖率

### 9.1 覆盖率配置

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts"]
    }
  }
});
```

### 9.2 运行覆盖率测试

```bash
npm run test:coverage
```

---

## 10. CI/CD集成

### 10.1 GitHub Actions配置

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run unit tests
        run: npm run test:run
        
      - name: Run type check
        run: npm run typecheck
        
      - name: Build
        run: npm run build
        
      - name: Run browser tests
        run: npm run test:map-engine
```

### 10.2 测试报告

**test-results目录结构**：
```
test-results/
├── surface-tile-regression.png
├── surface-tile-regression-metrics.json
├── camera-interaction-regression.png
├── basic-globe-performance-regression-metrics.json
└── map-engine-metrics-baseline-diff.json
```

---

## 11. 测试最佳实践

### 11.1 测试命名规范

```typescript
// 好的命名
describe('TileScheduler', () => {
  describe('request', () => {
    it('should deduplicate requests with same key', () => {});
    it('should respect concurrency limit', () => {});
    it('should prioritize visible tiles', () => {});
  });
});

// 不好的命名
describe('TileScheduler', () => {
  it('test1', () => {});
  it('test2', () => {});
});
```

### 11.2 测试数据管理

```typescript
// 使用factory函数创建测试数据
function createTestTile(overrides = {}) {
  return {
    id: 'test-tile',
    z: 12,
    x: 2048,
    y: 1024,
    ...overrides
  };
}

it('should handle tile loading', () => {
  const tile = createTestTile({ x: 1024 });
  // ...
});
```

---

## 12. 验收清单

满足以下项可认为测试策略达标：

1. [ ] 单元测试覆盖率 > 80%
2. [ ] 集成测试覆盖关键路径
3. [ ] 端到端测试覆盖主要场景
4. [ ] 性能基准测试通过
5. [ ] CI/CD集成完整
6. [ ] 测试报告清晰

---

## 13. 参考源码

- `vitest.config.ts` - 测试配置
- `scripts/browser-smoke-*.mjs` - 浏览器测试脚本
- `scripts/assert-map-engine-metrics-baseline.mjs` - 性能基准
- `tests/` - 测试目录

---

## 14. 下一步行动

1. 提高测试覆盖率
2. 添加更多端到端测试
3. 优化性能基准测试
4. 完善测试文档