# 移除 TiledImageryLayer（Canvas 方案）计划

**日期:** 2026-03-28
**目标:** 废弃并删除 `TiledImageryLayer` 及其依赖，统一到 `SurfaceTileLayer`

## 背景

`TiledImageryLayer` 通过全局 Canvas 将瓦片拼合为 Mercator 图集，再逐行投影为 Equirectangular 贴到球体上。存在：
- 固定分辨率上限（受限于 `MAX_TEXTURE_SIZE`）
- 高内存占用（两个全尺寸 Canvas + 大纹理）
- 无法叠加地形（与 `ElevationLayer` 互斥）
- 大量投影代码和 Worker 通信增加复杂度

`SurfaceTileLayer` 已在所有维度超越它：逐瓦片 Mesh、LOD、地形叠加、自适应分辨率。

## 影响范围

### 删除的文件

| 文件 | 原因 |
|------|------|
| `src/layers/TiledImageryLayer.ts` | 主体，565 行 |
| `src/workers/mercatorProjectionLookupWorker.ts` | 仅被 TiledImageryLayer 使用 |
| `tests/layers/TiledImageryLayer.test.ts` | 对应测试，638 行 |

### 修改的文件

| 文件 | 变更 |
|------|------|
| `src/index.ts` | 移除 `TiledImageryLayer` 导出 |
| `src/tiles/TileViewport.ts` | 移除 `computeTargetZoom` 和 `computeVisibleTileCoordinates`（唯一消费者被删除），保留 `TileCoordinate` 类型 |
| `tests/tiles/TileViewport.test.ts` | 移除已删除函数的测试 |

### 不受影响

- `SurfaceTileLayer` — 无变更，已是替代方案
- `ElevationLayer` — 无变更
- `tileLoader.ts` — 无变更（被 SurfaceTileLayer 和 ElevationLayer 使用）
- `TileCache` / `TileScheduler` — 无变更

## 执行步骤

1. 删除 `src/layers/TiledImageryLayer.ts`
2. 删除 `src/workers/mercatorProjectionLookupWorker.ts`
3. 删除 `tests/layers/TiledImageryLayer.test.ts`
4. 从 `src/index.ts` 移除 `TiledImageryLayer` 导出
5. 从 `src/tiles/TileViewport.ts` 移除 `computeTargetZoom` 和 `computeVisibleTileCoordinates`
6. 从 `tests/tiles/TileViewport.test.ts` 移除对应测试
7. 运行 typecheck + test + build 验证

## 验收标准

- [x] `npm run typecheck` 通过
- [x] `npm run test:run` 全部通过（40 文件 191 测试）
- [x] `npm run build` 成功
- [x] 全局搜索 `TiledImageryLayer` 零结果

## 实际变更补充

计划外发现并修复：

| 文件 | 变更 |
|------|------|
| `examples/basic-globe.ts` | 移除 `TiledImageryLayer` import 和实例化，fallback 逻辑简化 |
| `tests/examples/basic-globe.test.ts` | 移除 TiledImageryLayerMock，更新断言（3 层→2 层）|
| `src/tiles/TileCache.ts` | 修复泛型 `TileCacheOptions<TValue>` 类型参数 |
| `tests/tiles/TileScheduler.test.ts` | 修复 `resolveFirst` 类型签名 |
