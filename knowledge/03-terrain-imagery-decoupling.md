# 03 Terrain Imagery Decoupling

## 1. Provider 解耦是关键

Cesium 是“地形和影像双 provider”架构：

- 地形：`TerrainProvider`
- 影像：`ImageryProvider` + `ImageryLayer`

它们在 `GlobeSurfaceTileProvider` 中被组合，而不是互相硬耦合。

关键源码：

- `packages/engine/Source/Core/TerrainProvider.js`
- `packages/engine/Source/Scene/ImageryProvider.js`
- `packages/engine/Source/Scene/ImageryLayer.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`

## 2. 没有真实地形时为何仍可渲染

Cesium 默认挂 `EllipsoidTerrainProvider`，即“椭球地形底座”，因此影像永远有承载面。

关键源码：

- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Core/EllipsoidTerrainProvider.js`

## 3. 影像 LOD 不是被 terrain maxZoom 直接硬钳

- 影像层级由“目标 texel spacing”计算（和 terrain 几何误差相关）
- 影像加载中可回退祖先纹理，避免闪烁
- 影像 tile 与 terrain tile 通过 `TileImagery` 维护映射和引用计数

关键源码：

- `packages/engine/Source/Scene/ImageryLayer.js` (`_createTileImagerySkeletons`, `getLevelWithMaximumTexelSpacing`)
- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/Imagery.js`

## 4. 迁移规则

1. Terrain/Imagery 的 LOD 判定要独立建模。
2. 必须提供默认 ellipsoid terrain，禁止“无 terrain 时空白”。
3. Host tile 内要支持祖先影像链合成，不要单独父影像 mesh 闪烁方案。

