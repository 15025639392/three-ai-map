# 05 Crack Transition Stability

## 1. 裂缝治理

Cesium 不是只靠 skirts：

- `skirt`：几何边缘补边
- `TerrainFillMesh`：邻接 tile 边界传播 + fill mesh，处理缺失邻居与层级不齐

关键源码：

- `packages/engine/Source/Scene/TerrainFillMesh.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`

## 2. 闪烁治理（父子替换）

- 子节点未 ready 时，允许父节点继续渲染（kick/backfill）
- 影像未 ready 时，回退祖先影像
- `renderable` 采用“曾可渲染则保持”策略，避免新增图层时整块消失

关键源码：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`
- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`

## 3. 极区与边界

- 边界与角点由邻接 tile 传播填充，不依赖单一父级数据
- 2D/BITS12 量化误差需要 epsilon 扩边策略

