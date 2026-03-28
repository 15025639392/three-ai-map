# 瓦片渲染系统待解决问题分析

> **最后更新:** 2026-03-28

## 状态总览

| 编号 | 优先级 | 问题 | 状态 |
|------|--------|------|------|
| 1 | ~~H2/H3~~ | TiledImageryLayer Canvas 方案 | **已解决** — 已删除，统一到 SurfaceTileLayer |
| 2 | M5 | FrustumCuller 死代码 | 待定 |
| 3 | L1 | TileScheduler 优先级调度 | 开放 |
| 4 | P0 | VectorTileLayer MVT 解析未实现 | 开放 |
| 5 | P2 | tileLoader 无 AbortController 支持 | 开放 |
| 6 | P2 | TileCache 无 TTL 过期机制 | 开放 |
| 7 | P1 | 高德/百度瓦片无法叠加高程（坐标系偏移） | **已解决** — 新增 `coordTransform` 回调选项 |

---

## 1. ~~TiledImageryLayer Canvas 方案 (H2 + H3)~~ — 已解决

### 原问题描述

`TiledImageryLayer` 采用「全局 Canvas 纹理图集」方案：将所有可见瓦片拼贴到一张 Mercator Canvas 上，再逐行重投影为 Equirectangular 输出 Canvas，最终作为 `CanvasTexture` 贴到球体上。

- **H2 — 分辨率不足**：`effectiveMaxZoom` 被 `maxCanvasDimension / tileSize` 限制
- **H3 — 内存占用高**：`mercatorCanvas` + `outputCanvas` ≈ 128MB 固定开销

### 解决方式

2026-03-28 执行移除计划（详见 `docs/plans/remove-tiled-imagery-layer.md`）：
- 删除 `TiledImageryLayer`、`mercatorProjectionLookupWorker` 及对应测试
- 统一到 `SurfaceTileLayer`（Mesh 方案），无分辨率上限、支持混合 LOD、动态内存、地形叠加

---

## 2. FrustumCuller 死代码 (M5)

### 它是什么

`FrustumCuller`（`src/tiles/FrustumCuller.ts`，58 行）封装了 Three.js 的 `THREE.Frustum`，提供 `isSphereVisible`、`isBoxVisible`、`isCoordinateVisible`、`cull` 等裁剪 API。已导出且有 7 个测试。

### 为什么写了但没用

1. **瓦片可见性**：`SurfaceTileTree.selectSurfaceTileCoordinates` 使用射线采样（`TileViewport.computeVisibleTileCoordinates`），对球面几何比视锥裁剪更精确
2. **Marker/Polyline/Polygon**：直接交给 Three.js Scene graph，`WebGLRenderer` 内置 frustum culling
3. **InstancedMesh**：`InstancedMarkerLayer` 同样依赖 Three.js 内置机制

**结论：底层已通过射线采样和 Three.js 内置机制解决可见性问题，FrustumCuller 是多余的中间层。**

### 推荐处理

**方案 A — 保留但标注为预留（推荐）**：代码逻辑正确、有测试，可作为将来自定义裁剪管线的预留接口

**方案 B — 集成到 SurfaceTileLayer 做二次裁剪**：在高 zoom 场景弥补射线采样的边缘漏选，但收益有限

**方案 C — 删除**：减少 API 表面积，仅 58 行，需要时重写成本低

---

## 3. TileScheduler 优先级调度 (L1)

### 当前行为

`TileScheduler`（`src/tiles/TileScheduler.ts`，79 行）使用 FIFO 队列，屏幕中心瓦片和边缘瓦片享有同等优先级。快速移动相机时，inflight 中的过时请求仍占满 concurrency 插槽。

### 现有缓解机制

- **inflight 去重**：同一 key 只执行一次
- **cache 命中**：已加载过的瓦片不进入队列
- **StaleSurfaceTileError**：`SurfaceTileLayer` 的 `isCurrent()` 检查中止无用加载

**不足**：inflight 中的请求即使已无用，仍会占满并发槽直到完成。

### 推荐方案：优先级队列 + 取消机制

#### 3.1 请求优先级（~20 行）

扩展 `TileSchedulerOptions` 增加 `comparePriority` 回调，默认按 `payload.distanceFromCenter` 升序（中心优先）。将 `queue: Array` 改为按优先级排序，`processQueue` 变为 `dequeue` + `process` 模式。

#### 3.2 请求取消 / 抢占（~15 行）

在 `clear()` 基础上增加 `cancel(key)` 方法，释放 concurrency 插槽。`SurfaceTileLayer.syncTiles()` 中瓦片从 `nextKeys` 移除时调用。

#### 3.3 AbortController 集成（~30 行）

将 `loadTile` 签名扩展为接收 `AbortSignal`，cancel 时 abort 对应的 fetch / ImageBitmap 操作，立即释放网络资源。需同步修改 `defaultTileLoader`。

#### 3.4 渐进式加载策略（大改动）

相机快速移动时只请求当前 zoom，停止后 200ms 再请求 zoom+1 精细瓦片。

### 实施优先级

| 步骤 | 改动量 | 收益 |
|------|--------|------|
| 3.2 cancel(key) | 小 | 高 — 释放被浪费的并发槽 |
| 3.1 优先级排序 | 小 | 中 — 中心瓦片优先显示 |
| 3.3 AbortController | 中 | 高 — 节省网络带宽 |
| 3.4 渐进式加载 | 大 | 中 — 快速移动时减少请求量 |

---

## 4. VectorTileLayer MVT 解析未实现 (P0)

### 当前状态

`VectorTileLayer`（`src/layers/VectorTileLayer.ts`）是框架占位：
- `parseTile()` 接收 `Uint8Array` 但始终返回空数组
- 无 protobuf 解码、图层提取、坐标转换
- 已导出且有 2 个测试，但测试仅验证空壳行为

### 缺失能力

1. **MVT protobuf 解码**：需要 `pbf` 或 `flatbuffers` 库解析 `.pbf` 文件
2. **几何类型映射**：Point → 球面 3D 坐标、LineString → Polyline、Polygon → Mesh
3. **样式系统**：按图层/字段渲染不同样式（fill、stroke、icon）
4. **标签渲染**：文字标注的避让和布局

### 推荐实施路径

1. 引入 `@mapbox/vector-tile` + `pbf` 依赖（~15KB gzipped）
2. 实现 `MVTDecoder` 解码模块
3. 实现 `GeometryBuilder` 将 MVT 几何转为球面坐标
4. 建立基础样式系统（fill/stroke）
5. 参考 `SurfaceTileLayer` 架构实现瓦片生命周期管理

> 详见 `docs/plans/2026-03-28-three-map-enhancement.md` Task 4。

---

## 5. tileLoader 无 AbortController 支持 (P2)

### 当前状态

`tileLoader.ts`（`src/tiles/tileLoader.ts`，39 行）提供 `defaultTileLoader`：
- 支持 URL 模板替换
- 优先 `createImageBitmap`，降级 `HTMLImageElement`
- 正确处理 CORS 和 ObjectURL 释放

### 缺失能力

- **无 AbortController**：无法取消进行中的 fetch / ImageBitmap 解码
- **无错误重试**：fetch 失败直接 throw
- **无请求去重**：由上层 TileScheduler 处理

### 影响

与 Issue #3 (TileScheduler cancel) 耦合：即使 `TileScheduler` 支持 `cancel(key)`，底层 fetch 仍在执行，浪费带宽。

### 推荐方案

扩展 `defaultTileLoader` 签名：

```typescript
export async function defaultTileLoader(
  url: string,
  signal?: AbortSignal
): Promise<TileSource>
```

在 `fetch()` 调用中传递 `signal`，`createImageBitmap()` 通过 `ReadableStream` + `AbortSignal` 实现取消。

---

## 6. TileCache 无 TTL 过期机制 (P2)

### 当前状态

`TileCache`（`src/tiles/TileCache.ts`，57 行）实现 LRU 缓存：
- 基于 `Map` 插入顺序的 LRU 淘汰
- 固定容量
- `onEvict` 回调通知（释放 GPU 资源）
- 3 个测试覆盖

### 缺失能力

- **无 TTL/过期时间**：缓存条目永不过期（除非被 LRU 淘汰）
- **无大小感知**：不考虑单个条目的内存大小
- **无批量操作**：无 `getMulti`/`setMulti`

### 影响

长时间运行的应用中，卫星影像等动态数据源可能缓存过时内容。当前依赖 LRU 容量限制间接淘汰，但对高 zoom 瓦片（量大且很少回看）效率不高。

### 推荐方案（可选）

```typescript
export interface TileCacheOptions<TValue = unknown> {
  onEvict?: (key: string, value: TValue) => void;
  ttlMs?: number; // 条目最大存活时间，默认 Infinity
}
```

`get()` 时检查 `createdAt + ttlMs < Date.now()`，过期条目视为 miss 并触发 `onEvict`。对静态底图（如 OSM）可不设 TTL，对动态数据源（如天气、交通）设置 5-15 分钟 TTL。

---

## 7. 高德/百度瓦片无法叠加高程 (P1)

### 问题描述

`SurfaceTileLayer` 的几何体顶点基于 WGS-84 坐标系，而高德影像使用 GCJ-02、百度影像使用 BD-09 坐标系。两者之间存在 100-500m 的水平偏移（中国境内）。若同时启用高程，影像和立体地形不重合，视觉效果不可接受。

当前示例中高德/百度均通过设置 `elevationExaggeration: 0` 规避了此问题。

### 推荐方案

为 `SurfaceTileLayerOptions` 新增 `coordTransform` 回调，在构建几何体顶点时将 WGS-84 坐标转换为影像坐标系。已有 `wgs84ToGcj02`、`wgs84ToBd09` 等转换函数可直接复用。

改动量约 20-30 行，详见 `docs/plans/gcj02-bd09-elevation-support.md`。
