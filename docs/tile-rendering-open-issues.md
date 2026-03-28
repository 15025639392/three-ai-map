# 瓦片渲染系统待解决问题分析

## 1. TiledImageryLayer Canvas 方案 (H2 + H3)

### 问题描述

`TiledImageryLayer` 采用「全局 Canvas 纹理图集」方案：将所有可见瓦片拼贴到一张 Mercator Canvas 上，再逐行重投影为 Equirectangular 输出 Canvas，最终作为 `CanvasTexture` 贴到球体上。

**H2 — 分辨率不足**：`effectiveMaxZoom` 被 `maxCanvasDimension / tileSize` 限制（默认 4096 / 128 = zoom 5），全球纹理最多 4096×2048 像素。远看模糊，且无法突破此上限。

**H3 — 内存占用高**：`mercatorCanvas`（正方形，4096×4096）+ `outputCanvas`（4096×2048）= 约 128MB（RGBA 4 字节/像素 × (4096×4096 + 4096×2048)）。

### 两套方案对比

| 维度 | TiledImageryLayer（Canvas 方案） | SurfaceTileLayer（Mesh 方案） |
|------|------|------|
| 纹理 | 单张全局 CanvasTexture | 每瓦片独立 Texture |
| 投影 | CPU 逐行重投影（Mercator→Equirectangular） | 球面坐标直接映射为 3D 曲面，无投影转换 |
| LOD | 全局单一 zoom | 混合 LOD（中心精细、边缘粗糙） |
| 内存 | ~128MB 固定（Canvas 图集） | 按可见瓦片数动态分配（通常 4–36 张纹理） |
| 分辨率上限 | 受 maxCanvasDimension 限制 | 无上限，zoom 越高纹理越精细 |
| 缝隙处理 | 无缝隙（单一纹理） | 需要 skirt + UV inset 掩盖缝隙 |
| 适用场景 | 简单展示、低 zoom | 生产级渲染、高 zoom、地形叠加 |

### 推荐方案：废弃 TiledImageryLayer，统一到 SurfaceTileLayer

**理由**：
- `SurfaceTileLayer` 是更先进的方案，已在测试和 demo 中验证可用
- Mesh 方案天然支持混合 LOD、高 zoom、地形叠加
- Canvas 方案的 ~128MB 固定开销在移动端不可接受
- 维护两套方案增加代码负担，重复的 `defaultTileLoader`（已修复）只是冰山一角

**迁移路径**：
1. 将 `TiledImageryLayer` 标记为 `@deprecated`
2. 更新 demo 和文档，将默认示例切换到 `SurfaceTileLayer`
3. 在 `SurfaceTileLayer` 中添加 Equirectangular 采样支持（如需与 `GlobeMesh` 的球体网格配合，而非独立 Mesh 渲染）
4. 保留 `TiledImageryLayer` 代码 1–2 个版本周期后移除

**替代方案（如必须保留 Canvas 方案）**：
- **降低 tileSize**：将默认从 128 降到 64，可将 effectiveMaxZoom 从 5 提升到 6（分辨率翻倍），但内存不变
- **WebGL 纹理压缩**：使用 `EXT_texture_compression_s3tc` / `WEBGL_compressed_texture_etc` 格式存储中间 Canvas，可降低 4–8 倍 GPU 显存
- **局部 Canvas**：只保留当前视口 ± padding 的瓦片区域（而非全球），裁剪掉屏幕外内容，但增加实现复杂度

---

## 2. FrustumCuller 死代码 (M5)

### 它是什么

`FrustumCuller` 封装了 Three.js 的 `THREE.Frustum`，提供以下能力：
- `updateFrustum(camera)` — 从相机投影矩阵计算视锥体
- `isSphereVisible(sphere)` — 判断球体是否在视锥内
- `isBoxVisible(box)` — 判断包围盒是否在视锥内
- `isCoordinateVisible(coord)` — 将经纬度转为 3D 点后判断可见性
- `cull(spheres)` / `cullBoxes(boxes)` — 批量裁剪
- `cullCoordinates(coords)` — 批量裁剪经纬度坐标

### 为什么写了但没用

从代码历史推断，`FrustumCuller` 是在增强计划 P0–P1 阶段作为「视锥裁剪」基础设施编写的（Task 8 的一部分），意图用于瓦片和 Marker 的可见性判断。但在实际实现中：

1. **瓦片可见性**：`SurfaceTileTree.selectSurfaceTileCoordinates` 使用了射线采样（`TileViewport.computeVisibleTileCoordinates`），通过从相机向球面发射多条射线来确定可见瓦片。这种方式对球面几何比视锥裁剪更精确（球面不是平面，视锥裁剪会产生 false positive）。

2. **Marker/Polyline/Polygon 裁剪**：这些图层直接交给 Three.js 的 Scene graph 渲染，Three.js 内部的 `WebGLRenderer` 已内置 frustum culling（基于 `Object3D.frustumCulled` + boundingSphere），不需要应用层再做一次。

3. **InstancedMesh 批量裁剪**：`InstancedMarkerLayer` 也没有使用它，而是直接依赖 Three.js 的实例化渲染。

简言之：**底层已经通过射线采样和 Three.js 内置机制解决了可见性问题**，`FrustumCuller` 变成了多余的中间层。

### 推荐处理

**方案 A — 保留但降低优先级（推荐）**：
- 当前代码已导出、有 7 个测试覆盖、逻辑正确
- 可作为将来「非 Three.js 后端」或「自定义裁剪管线」的预留接口
- 无需删除，但在架构文档中标注为「预留，当前未使用」

**方案 B — 集成到 SurfaceTileLayer 做二次裁剪**：
- 在 `SurfaceTileTree.selectSurfaceTileCoordinates` 选出候选瓦片后，用 `FrustumCuller` 做二次过滤
- 对高 zoom 场景，射线采样可能漏掉边缘瓦片（采样点不足），视锥裁剪可弥补
- 但收益有限（已有 padding 机制），且需要为每个瓦片构建 BoundingSphere

**方案 C — 删除**：
- 减少 API 表面积和测试维护负担
- 但删除后如果需要，重新编写成本不高（仅 58 行）

---

## 3. TileScheduler 优先级调度 (L1)

### 当前行为

`TileScheduler` 使用 FIFO 队列：所有请求按到达顺序处理，屏幕中心瓦片和屏幕边缘瓦片享有同等优先级。用户快速移动相机时，队列中可能堆积大量即将离开视口的瓦片请求，而屏幕中心的新瓦片需要排队等待。

### 现有的「伪优先级」机制

虽然没有显式的优先级队列，但以下机制已部分缓解了该问题：

1. **inflight 去重**：同一 key 的重复请求只执行一次
2. **cache 命中**：已加载过的瓦片直接从 cache 返回，不进入队列
3. **StaleSurfaceTileError**：`SurfaceTileLayer` 的 `isCurrent()` 检查会在瓦片不再需要时中止加载

**但这些不够**：inflight 中的请求即使已无用（相机已移走），仍会占满 concurrency 插槽直到完成。

### 推荐方案：优先级队列 + 取消机制

#### 3.1 请求优先级

```typescript
interface TileSchedulerOptions<TValue, TPayload> {
  concurrency: number;
  loadTile: (payload: TPayload) => Promise<TValue>;
  comparePriority?: (a: QueuedRequest<TValue, TPayload>,
                      b: QueuedRequest<TValue, TPayload>) => number;
}
```

调用方在 `request()` 时传入优先级权重：

```typescript
// SurfaceTileLayer 中
scheduler.request(key, { coordinate, distanceFromCenter: 0.3 });
```

`comparePriority` 默认按 `payload.distanceFromCenter` 升序（中心优先）。每次 `processQueue` 时从队列中选取最高优先级请求。

**实现要点**：
- 将 `queue: Array` 改为按优先级排序，或使用二叉堆
- `processQueue` 变为 `dequeue` + `process` 模式
- 现有 FIFO 行为作为 `comparePriority` 未提供时的默认值

#### 3.2 请求取消 / 抢占

在 `clear()` 基础上增加 `cancel(key)` 方法：

```typescript
cancel(key: string): boolean {
  const idx = this.queue.findIndex(r => r.key === key);
  if (idx >= 0) {
    const request = this.queue[idx];
    this.queue.splice(idx, 1);
    this.inflight.delete(key);
    request.reject(new Error("Tile request cancelled"));
    return true;
  }
  return false;
}
```

`SurfaceTileLayer.syncTiles()` 中，当瓦片从 `nextKeys` 中移除时调用 `scheduler.cancel(key)`，释放 concurrency 插槽给新请求。

#### 3.3 AbortController 集成（高级）

将 `loadTile` 签名扩展为接收 `AbortSignal`：

```typescript
loadTile: (payload: TPayload, signal: AbortSignal) => Promise<TValue>;
```

当请求被 cancel 或 clear 时，abort 对应的 fetch / ImageBitmap 操作，立即释放网络资源。这需要修改 `defaultTileLoader` 传递 signal 到 `fetch()` 调用。

#### 3.4 渐进式加载策略

对于高 zoom 场景，可采用「先粗后精」策略：
1. 当 camera 快速移动时，只请求当前 zoom 的瓦片
2. camera 停止后 200ms，再请求 zoom+1 的精细瓦片
3. 通过 `debounce` + `requestIdleCallback` 实现

### 实施优先级

| 步骤 | 改动量 | 收益 |
|------|--------|------|
| 3.1 优先级排序 | 小（~20 行） | 中 — 中心瓦片优先显示 |
| 3.2 cancel(key) | 小（~15 行） | 高 — 释放被浪费的并发槽 |
| 3.3 AbortController | 中（~30 行 + defaultTileLoader 改动） | 高 — 节省网络带宽 |
| 3.4 渐进式加载 | 大（涉及 Layer 调度逻辑） | 中 — 快速移动时减少请求量 |

建议先实施 3.2（cancel），然后 3.1（优先级），最后根据需要决定是否做 3.3 和 3.4。
