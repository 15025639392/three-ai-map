# Three.js 地图引擎补齐计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前轻量地球引擎（0.1.0）提升为完整地图引擎，补齐矢量瓦片、几何计算、多投影、坐标系转换、视锥裁剪等核心缺失，增强交互体验和性能优化，形成具备竞争力的轻量级地图引擎。

**Architecture:** 继续采用分层式内核结构，在现有 `core / geo / globe / layers / engine / tiles` 基础上扩展 `vector / projection / spatial / interaction` 等模块。保持窄接口和最小能力集原则，优先建立稳定数据流与生命周期。

**Tech Stack:** `TypeScript`, `three`, `Rspack`, 原生浏览器 API（新增可选依赖：protobuff、turf.js-lite）

---

## 阶段一：补齐核心缺失（1-2 个月）

### Task 1: 建立几何计算库

**Priority:** P0.2
**Files:**
- Create: `src/spatial/SpatialMath.ts`
- Create: `src/spatial/Distance.ts`
- Create: `src/spatial/Area.ts`
- Create: `src/spatial/Relation.ts`
- Create: `tests/spatial/Distance.test.ts`
- Create: `tests/spatial/Area.test.ts`
- Create: `tests/spatial/Relation.test.ts`

**Step 1: 写失败测试**

```ts
import { haversineDistance, greatCircleDistance } from "../../src/spatial/Distance";
import { polygonArea } from "../../src/spatial/Area";
import { pointInPolygon, distanceToLine } from "../../src/spatial/Relation";

describe("Distance", () => {
  it("calculates haversine distance between two coordinates", () => {
    const distance = haversineDistance(
      { lng: 0, lat: 0 },
      { lng: 0, lat: 1 }
    );
    expect(distance).toBeCloseTo(111320, 100); // ~111km per degree
  });

  it("calculates great circle distance", () => {
    const distance = greatCircleDistance(
      { lng: 0, lat: 0 },
      { lng: 90, lat: 0 }
    );
    expect(distance).toBeCloseTo(10007543, 100); // quarter of Earth's circumference
  });
});

describe("Area", () => {
  it("calculates polygon area", () => {
    const area = polygonArea([
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      { lng: 1, lat: 1 },
      { lng: 0, lat: 1 }
    ]);
    expect(area).toBeGreaterThan(0);
  });
});

describe("Relation", () => {
  it("checks if point is in polygon", () => {
    const result = pointInPolygon(
      { lng: 0.5, lat: 0.5 },
      [{ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, { lng: 1, lat: 1 }, { lng: 0, lat: 1 }]
    );
    expect(result).toBe(true);
  });

  it("calculates distance from point to line", () => {
    const distance = distanceToLine(
      { lng: 0.5, lat: 0.5 },
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 }
    );
    expect(distance).toBeCloseTo(55660, 100); // ~0.5 degrees at equator
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/spatial/Distance.test.ts tests/spatial/Area.test.ts tests/spatial/Relation.test.ts`
Expected: FAIL with module not found or function not implemented

**Step 3: 写最小实现**

- 实现球面距离计算
- 实现多边形面积计算（考虑球面几何）
- 实现点线面关系判断
- 导出统一的几何计算 API

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/spatial/Distance.test.ts tests/spatial/Area.test.ts tests/spatial/Relation.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/spatial tests/spatial
git commit -m "feat: 添加几何计算库（距离、面积、关系）"
```

---

### Task 2: 建立坐标系转换系统

**Priority:** P0.4
**Files:**
- Create: `src/geo/transform/WGS84.ts`
- Create: `src/geo/transform/GCJ02.ts`
- Create: `src/geo/transform/BD09.ts`
- Create: `src/geo/transform/index.ts`
- Create: `tests/geo/transform.test.ts`

**Step 1: 写失败测试**

```ts
import { wgs84ToGcj02, gcj02ToWgs84, gcj02ToBd09, bd09ToGcj02 } from "../../src/geo/transform";

describe("Coordinate Transform", () => {
  const beijingWGS84 = { lng: 116.404, lat: 39.915 };

  it("converts WGS84 to GCJ02", () => {
    const gcj02 = wgs84ToGcj02(beijingWGS84);
    expect(gcj02.lng).not.toBe(beijingWGS84.lng);
    expect(gcj02.lat).not.toBe(beijingWGS84.lat);
    expect(Math.abs(gcj02.lng - beijingWGS84.lng)).toBeLessThan(0.1); // offset should be small
  });

  it("is reversible between WGS84 and GCJ02", () => {
    const gcj02 = wgs84ToGcj02(beijingWGS84);
    const back = gcj02ToWgs84(gcj02);
    expect(back.lng).toBeCloseTo(beijingWGS84.lng, 6);
    expect(back.lat).toBeCloseTo(beijingWGS84.lat, 6);
  });

  it("converts GCJ02 to BD09", () => {
    const gcj02 = { lng: 116.404, lat: 39.915 };
    const bd09 = gcj02ToBd09(gcj02);
    expect(bd09.lng).not.toBe(gcj02.lng);
    expect(bd09.lat).not.toBe(gcj02.lat);
  });

  it("is reversible between GCJ02 and BD09", () => {
    const gcj02 = { lng: 116.404, lat: 39.915 };
    const bd09 = gcj02ToBd09(gcj02);
    const back = bd09ToGcj02(bd09);
    expect(back.lng).toBeCloseTo(gcj02.lng, 6);
    expect(back.lat).toBeCloseTo(gcj02.lat, 6);
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/geo/transform.test.ts`
Expected: FAIL with transform functions not found

**Step 3: 写最小实现**

- 实现地球椭球偏移算法（Krasovsky 1940）
- 实现 GCJ02 加密算法
- 实现 BD09 转换算法
- 导出统一的转换接口

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/geo/transform.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/geo/transform tests/geo/transform.test.ts
git commit -m "feat: 添加坐标系转换系统（WGS84/GCJ02/BD09）"
```

---

### Task 3: 建立多投影系统

**Priority:** P0.3
**Files:**
- Create: `src/projection/base/Projection.ts`
- Create: `src/projection/MercatorProjection.ts`
- Create: `src/projection/WGS84Projection.ts`
- Create: `src/projection/GeographicProjection.ts`
- Create: `tests/projection/projection.test.ts`
- Modify: `src/geo/projection.ts` (重构为投影适配器)

**Step 1: 写失败测试**

```ts
import { MercatorProjection, WGS84Projection, GeographicProjection } from "../../src/projection";

describe("MercatorProjection", () => {
  it("projects lat/lng to normalized UV", () => {
    const projection = new MercatorProjection();
    const uv = projection.project({ lng: 0, lat: 0 });
    expect(uv.u).toBeCloseTo(0.5, 6);
    expect(uv.v).toBeCloseTo(0.5, 6);
  });

  it("unprojects UV back to lat/lng", () => {
    const projection = new MercatorProjection();
    const coord = projection.unproject({ u: 0.5, v: 0.5 });
    expect(coord.lng).toBeCloseTo(0, 6);
    expect(coord.lat).toBeCloseTo(0, 6);
  });
});

describe("GeographicProjection", () => {
  it("projects lat/lng to normalized UV", () => {
    const projection = new GeographicProjection();
    const uv = projection.project({ lng: 0, lat: 0 });
    expect(uv.u).toBeCloseTo(0.5, 6);
    expect(uv.v).toBeCloseTo(0.5, 6);
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/projection/projection.test.ts`
Expected: FAIL with projection classes not found

**Step 3: 写最小实现**

- 定义投影基类接口（project/unproject）
- 实现 Mercator 投影（保持现有逻辑）
- 实现 WGS84 球面投影
- 实现 Equirectangular 投影
- 重构现有坐标系统为投影适配器模式

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/projection/projection.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/projection tests/projection src/geo/projection.ts
git commit -m "feat: 建立多投影系统架构"
```

---

### Task 4: 实现 MVT 矢量瓦片图层

**Priority:** P0.1
**Files:**
- Create: `src/vector/MVTDecoder.ts`
- Create: `src/vector/GeometryBuilder.ts`
- Create: `src/layers/VectorTileLayer.ts`
- Create: `src/vector/Style.ts`
- Create: `tests/vector/MVTDecoder.test.ts`
- Create: `tests/layers/VectorTileLayer.test.ts`
- Modify: `src/engine/EngineOptions.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { VectorTileLayer } from "../../src/layers/VectorTileLayer";

describe("VectorTileLayer", () => {
  it("loads and renders MVT tiles", async () => {
    const layer = new VectorTileLayer("vector", {
      templateUrl: "https://example.com/{z}/{x}/{y}.pbf"
    });
    // expect tiles to load and geometry to be rendered
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: FAIL with VectorTileLayer not found

**Step 3: 写最小实现**

- 集成 protobuf 解析 MVT
- 实现 MVT 几何类型转换到球面坐标
- 实现基础样式系统
- 创建 VectorTileLayer 支持矢量瓦片渲染
- 集成到 GlobeEngine

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/vector/MVTDecoder.test.ts tests/layers/VectorTileLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/vector src/layers/VectorTileLayer.ts src/engine tests/vector tests/layers/VectorTileLayer.test.ts
git commit -m "feat: 添加 MVT 矢量瓦片图层支持"
```

---

## 阶段二：增强交互体验（1-1.5 个月）

### Task 5: 实现动画过渡系统

**Priority:** P1.3
**Files:**
- Create: `src/core/Animator.ts`
- Create: `src/core/Easing.ts`
- Create: `tests/core/Animator.test.ts`
- Modify: `src/core/CameraController.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { Animator, Easing } from "../../src/core";

describe("Animator", () => {
  it("animates a value with easing", (done) => {
    const animator = new Animator();
    animator.animate({
      from: 0,
      to: 1,
      duration: 1000,
      easing: Easing.easeInOut,
      onUpdate: (value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      },
      onComplete: () => {
        done();
      }
    });
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/core/Animator.test.ts`
Expected: FAIL with Animator not found

**Step 3: 写最小实现**

- 实现动画队列管理
- 实现缓动函数集合
- 集成到 CameraController 支持平滑 setView
- 集成到 GlobeEngine 暴露动画 API

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/core/Animator.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/Animator.ts src/core/Easing.ts tests/core/Animator.test.ts src/core/CameraController.ts src/engine/GlobeEngine.ts
git commit -m "feat: 添加动画过渡系统"
```

---

### Task 6: 实现触摸手势支持

**Priority:** P1.4
**Files:**
- Create: `src/interaction/TouchController.ts`
- Create: `tests/interaction/TouchController.test.ts`
- Modify: `src/core/CameraController.ts`

**Step 1: 写失败测试**

```ts
import { TouchController } from "../../src/interaction";

describe("TouchController", () => {
  it("handles pinch to zoom", () => {
    // expect pinch gesture to update camera altitude
  });

  it("handles two-finger rotate", () => {
    // expect two-finger rotate to update camera orbit
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/interaction/TouchController.test.ts`
Expected: FAIL with TouchController not found

**Step 3: 写最小实现**

- 实现单指拖拽（复用现有逻辑）
- 实现双指捏合缩放
- 实现双指旋转
- 集成到 CameraController

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/interaction/TouchController.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/interaction/TouchController.ts tests/interaction/TouchController.test.ts src/core/CameraController.ts
git commit -m "feat: 添加触摸手势支持"
```

---

### Task 7: 实现实例化渲染优化

**Priority:** P1.2
**Files:**
- Modify: `src/layers/MarkerLayer.ts`
- Create: `tests/layers/MarkerLayerInstanced.test.ts`

**Step 1: 写失败测试**

```ts
import { MarkerLayer } from "../../src/layers/MarkerLayer";

describe("MarkerLayer Instanced", () => {
  it("uses InstancedMesh for performance", () => {
    const layer = new MarkerLayer("markers");
    for (let i = 0; i < 10000; i++) {
      layer.addMarker({
        id: `marker-${i}`,
        lng: (i % 360) - 180,
        lat: (Math.random() - 0.5) * 180,
        altitude: 0
      });
    }
    // expect single InstancedMesh instead of 10000 meshes
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/MarkerLayerInstanced.test.ts`
Expected: FAIL - currently uses individual meshes

**Step 3: 写最小实现**

- 重构 MarkerLayer 使用 InstancedMesh
- 实现矩阵更新优化
- 保持拾取逻辑兼容

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/MarkerLayerInstanced.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/MarkerLayer.ts tests/layers/MarkerLayerInstanced.test.ts
git commit -m "feat: 优化 MarkerLayer 使用 InstancedMesh"
```

---

### Task 8: 实现视锥裁剪

**Priority:** P1.1
**Files:**
- Create: `src/core/Frustum.ts`
- Create: `tests/core/Frustum.test.ts`
- Modify: `src/tiles/TileViewport.ts`
- Modify: `src/layers/SurfaceTileLayer.ts`

**Step 1: 写失败测试**

```ts
import { Frustum } from "../../src/core";

describe("Frustum Culling", () => {
  it("culls tiles outside frustum", () => {
    const frustum = new Frustum(camera, viewport);
    const visible = frustum.intersectsSphere(sphere);
    expect(visible).toBe(true); // or false based on position
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/core/Frustum.test.ts`
Expected: FAIL with Frustum not found

**Step 3: 写最小实现**

- 实现视锥体计算
- 实现球体与视锥求交
- 重构 TileViewport 使用精确裁剪
- 减少采样近似误差

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/core/Frustum.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/Frustum.ts tests/core/Frustum.test.ts src/tiles/TileViewport.ts src/layers/SurfaceTileLayer.ts
git commit -m "feat: 添加视锥裁剪优化"
```

---

### Task 9: 建立自定义图层扩展机制

**Priority:** P1.5
**Files:**
- Create: `src/layers/CustomLayer.ts`
- Create: `examples/custom-layer.ts`
- Modify: `README.md`

**Step 1: 写失败测试**

手工验收：用户无法方便地创建自定义图层

**Step 2: 运行测试并确认失败**

Run: `npm run dev`
Expected: custom layer example doesn't exist

**Step 3: 写最小实现**

- 提供自定义图层基类
- 提供生命周期钩子文档
- 提供自定义图层示例

**Step 4: 运行测试并确认通过**

Run: `npm run dev`
Expected: custom layer example works

**Step 5: 提交**

```bash
git add src/layers/CustomLayer.ts examples/custom-layer.ts README.md
git commit -m "feat: 添加自定义图层扩展机制"
```

---

## 阶段三：高级特性开发（1.5-2 个月）

### Task 10: 实现性能监控系统

**Priority:** P2.5
**Files:**
- Create: `src/performance/Stats.ts`
- Create: `src/performance/Profiler.ts`
- Create: `tests/performance/Stats.test.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { Stats } from "../../src/performance";

describe("Stats", () => {
  it("tracks FPS and frame time", () => {
    const stats = new Stats();
    stats.update(performance.now());
    expect(stats.fps).toBeGreaterThan(0);
  });

  it("tracks memory usage", () => {
    const stats = new Stats();
    stats.updateMemory();
    expect(stats.memory).toBeGreaterThan(0);
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/performance/Stats.test.ts`
Expected: FAIL with Stats not found

**Step 3: 写最小实现**

- 实现 FPS 追踪
- 实现帧时间追踪
- 实现内存监控
- 实现瓦片加载统计
- 集成到 GlobeEngine 暴露 stats API

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/performance/Stats.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/performance tests/performance src/engine/GlobeEngine.ts
git commit -m "feat: 添加性能监控系统"
```

---

### Task 11: 实现空间索引

**Priority:** P2.2
**Files:**
- Create: `src/spatial/index/RTree.ts`
- Create: `tests/spatial/index/RTree.test.ts`
- Modify: `src/layers/MarkerLayer.ts`
- Modify: `src/layers/PolylineLayer.ts`
- Modify: `src/layers/PolygonLayer.ts`

**Step 1: 写失败测试**

```ts
import { RTree } from "../../src/spatial/index";

describe("RTree", () => {
  it("builds and queries spatial index", () => {
    const tree = new RTree();
    tree.insert({ id: 1, bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } });
    tree.insert({ id: 2, bounds: { min: { x: 2, y: 2 }, max: { x: 3, y: 3 } } });

    const results = tree.query({ min: { x: 0.5, y: 0.5 }, max: { x: 1.5, y: 1.5 } });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/spatial/index/RTree.test.ts`
Expected: FAIL with RTree not found

**Step 3: 写最小实现**

- 实现 R-tree 数据结构
- 实现空间查询接口
- 集成到图层加速拾取

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/spatial/index/RTree.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/spatial/index tests/spatial/index src/layers
git commit -m "feat: 添加 R-tree 空间索引加速查询"
```

---

### Task 12: 实现聚合图层

**Priority:** P2.3
**Files:**
- Create: `src/layers/ClusterLayer.ts`
- Create: `src/algorithm/Clustering.ts`
- Create: `tests/layers/ClusterLayer.test.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { ClusterLayer } from "../../src/layers/ClusterLayer";

describe("ClusterLayer", () => {
  it("clusters nearby markers", () => {
    const layer = new ClusterLayer("clusters", { maxDistance: 100000 }); // 100km
    layer.addMarker({ id: "1", lng: 0, lat: 0 });
    layer.addMarker({ id: "2", lng: 0.1, lat: 0 }); // nearby
    // expect 2 markers to be clustered into 1 cluster
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/ClusterLayer.test.ts`
Expected: FAIL with ClusterLayer not found

**Step 3: 写最小实现**

- 实现基于距离的聚类算法
- 实现聚合点可视化
- 支持点击展开聚合点
- 集成到 GlobeEngine

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/ClusterLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/ClusterLayer.ts src/algorithm/Clustering.ts tests/layers/ClusterLayer.test.ts src/engine/GlobeEngine.ts
git commit -m "feat: 添加聚合图层支持"
```

---

### Task 13: 实现热力图图层

**Priority:** P2.4
**Files:**
- Create: `src/layers/HeatmapLayer.ts`
- Create: `src/shader/HeatmapMaterial.ts`
- Create: `tests/layers/HeatmapLayer.test.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { HeatmapLayer } from "../../src/layers/HeatmapLayer";

describe("HeatmapLayer", () => {
  it("renders heatmap from points", () => {
    const layer = new HeatmapLayer("heatmap");
    layer.addPoint({ lng: 0, lat: 0, intensity: 1 });
    layer.addPoint({ lng: 0.1, lat: 0, intensity: 0.5 });
    // expect heatmap gradient to be visible
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/HeatmapLayer.test.ts`
Expected: FAIL with HeatmapLayer not found

**Step 3: 写最小实现**

- 实现热力图密度计算
- 实现自定义着色器渲染热力图
- 支持强度半径调整
- 集成到 GlobeEngine

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/HeatmapLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/HeatmapLayer.ts src/shader/HeatmapMaterial.ts tests/layers/HeatmapLayer.test.ts src/engine/GlobeEngine.ts
git commit -m "feat: 添加热力图图层"
```

---

### Task 14: 实现后处理系统

**Priority:** P2.1
**Files:**
- Create: `src/postprocessing/EffectComposer.ts`
- Create: `src/postprocessing/BloomPass.ts`
- Create: `src/postprocessing/HDRPass.ts`
- Create: `tests/postprocessing/EffectComposer.test.ts`
- Modify: `src/engine/EngineOptions.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写失败测试**

```ts
import { EffectComposer, BloomPass } from "../../src/postprocessing";

describe("EffectComposer", () => {
  it("composes multiple post-processing passes", () => {
    const composer = new EffectComposer(renderer);
    composer.addPass(new BloomPass({ intensity: 1.5 }));
    composer.addPass(new HDRPass({ exposure: 1.0 }));
    composer.render(scene, camera);
    // expect bloom and HDR effects to be applied
  });
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/postprocessing/EffectComposer.test.ts`
Expected: FAIL with post-processing not found

**Step 3: 写最小实现**

- 集成 EffectComposer
- 实现 Bloom 通道
- 实现 HDR 通道
- 提供后处理 API

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/postprocessing/EffectComposer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/postprocessing tests/postprocessing src/engine
git commit -m "feat: 添加后处理系统（Bloom/HDR）"
```

---

## 阶段四：工程化优化（1 个月）

### Task 15: Bundle 体积优化

**Priority:** P3.1
**Files:**
- Modify: `rspack.config.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/main.ts`
- Create: `examples/lazy-*.ts`

**Step 1: 写失败测试**

手工验收：main.js 当前约 505KB，需要优化至 <300KB

**Step 2: 运行测试并确认失败**

Run: `npm run build`
Expected: main.js is 505KB, not optimized

**Step 3: 写最小实现**

- 拆分 core 和高级特性为独立 chunk
- 实现按需加载
- 优化 Tree-shaking 配置
- 移除未使用代码

**Step 4: 运行测试并确认通过**

Run: `npm run build`
Expected: main.js < 300KB

**Step 5: 提交**

```bash
git add rspack.config.ts src/engine/GlobeEngine.ts src/main.ts examples
git commit -m "perf: 优化 bundle 体积至 <300KB"
```

---

### Task 16: TypeScript 类型增强

**Priority:** P3.2
**Files:**
- Modify: `tsconfig.json`
- Modify: `src/**/*.ts` (补充类型定义)

**Step 1: 写失败测试**

```bash
npm run typecheck
```
Expected: type errors may exist or strict mode not enabled

**Step 2: 运行测试并确认失败**

Run: `npm run typecheck`
Expected: type errors or loose mode

**Step 3: 写最小实现**

- 启用严格模式
- 补充缺失类型定义
- 移除 any 类型
- 增加泛型约束

**Step 4: 运行测试并确认通过**

Run: `npm run typecheck`
Expected: PASS with strict mode

**Step 5: 提交**

```bash
git add tsconfig.json src
git commit -m "types: 启用严格模式并完善类型定义"
```

---

### Task 17: E2E 测试覆盖

**Priority:** P3.4
**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/basic-globe.spec.ts`
- Create: `tests/e2e/interaction.spec.ts`
- Create: `tests/e2e/layers.spec.ts`
- Modify: `package.json`

**Step 1: 写失败测试**

```bash
npm run test:e2e
```
Expected: command not found

**Step 2: 运行测试并确认失败**

Run: `npm run test:e2e`
Expected: PLAYWRIGHT not installed or no tests

**Step 3: 写最小实现**

- 配置 Playwright
- 编写基础场景 E2E 测试
- 编写交互流程 E2E 测试
- 编写图层加载 E2E 测试

**Step 4: 运行测试并确认通过**

Run: `npm run test:e2e`
Expected: PASS

**Step 5: 提交**

```bash
git add playwright.config.ts tests/e2e package.json
git commit -m "test: 添加 E2E 测试覆盖"
```

---

### Task 18: 文档完善

**Priority:** P3.3
**Files:**
- Create: `docs/api/GlobeEngine.md`
- Create: `docs/api/Layer.md`
- Create: `docs/api/Projection.md`
- Create: `docs/api/Spatial.md`
- Create: `docs/guides/getting-started.md`
- Create: `docs/guides/custom-layers.md`
- Create: `docs/guides/projections.md`
- Create: `examples/*.ts` (更多示例)
- Modify: `README.md`

**Step 1: 写失败测试**

手工验收：API 文档和教程不完整

**Step 2: 运行测试并确认失败**

Run: check docs/
Expected: missing documentation

**Step 3: 写最小实现**

- 编写完整的 API 文档
- 编写入门教程
- 编进阶示例
- 更新 README

**Step 4: 运行测试并确认通过**

手工验证文档完整性

**Step 5: 提交**

```bash
git add docs examples README.md
git commit -m "docs: 完善文档和示例"
```

---

### Task 19: 最终验收

**Priority:** 综合
**Files:**
- Create: `docs/acceptance/enhanced-map-engine.md`

**Step 1: 写失败测试**

验收标准未定义

**Step 2: 运行测试并确认失败**

Run: check against acceptance criteria
Expected: not all criteria met

**Step 3: 写最小实现**

定义完整验收标准并验证

**Step 4: 运行测试并确认通过**

Run: `npm run test:run && npm run typecheck && npm run build && npm run test:e2e`
Expected: ALL PASS

**Step 5: 提交**

```bash
git add docs/acceptance/enhanced-map-engine.md
git commit -m "docs: 添加完整地图引擎验收文档"
git tag -a v1.0.0 -m "Release v1.0.0: Complete Map Engine"
```

---

## 附录 A: 验收标准（最终）

### 功能完整性
- ✅ 支持矢量瓦片（MVT）加载和渲染
- ✅ 支持多种投影
- ✅ 支持坐标系转换（WGS84/GCJ02/BD09）
- ✅ 提供完整的几何计算 API
- ✅ 支持动画过渡
- ✅ 支持触摸手势
- ✅ 支持万级标记点（InstancedMesh）
- ✅ 瓦片加载优化 20%+
- ✅ 支持自定义图层扩展
- ✅ 支持性能监控
- ✅ 支持海量数据聚合
- ✅ 支持热力图
- ✅ 支持后处理效果

### 性能指标
- ✅ Bundle 体积 < 300KB
- ✅ 类型覆盖率 > 90%
- ✅ E2E 覆盖关键流程
- ✅ FPS > 60（标清场景）
- ✅ 内存占用 < 200MB（基础场景）

### 工程质量
- ✅ 所有测试通过
- ✅ 无 TypeScript 类型错误
- ✅ 构建成功
- ✅ 文档完整
- ✅ 示例丰富

---

## 附录 B: 风险与应对

### 技术风险
1. **MVT 解析复杂度**：先实现基础点线面，后续扩展复杂样式
2. **性能瓶颈**：引入更激进的 LOD 和卸载机制
3. **兼容性问题**：增加特性检测和降级方案

### 架构建议
1. **保持轻量**：新增功能评估必要性，避免臃肿
2. **模块化设计**：核心引擎与高级特性解耦
3. **渐进增强**：基础功能优先，高级特性可选

---

**总预估工作量**: 4.5-6.5 个月
**最终目标**: 具备竞争力的轻量级地图引擎（v1.0.0）
