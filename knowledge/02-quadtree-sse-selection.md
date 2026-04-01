# 02 Quadtree SSE Selection

## 1. SSE 判定模型

Cesium 3D 模式的核心公式：

- `error = (maxGeometricError * drawingBufferHeight) / (distance * sseDenominator)`
- 再叠加 `fog` 修正，并除以 `pixelRatio`

关键源码：

- `packages/engine/Source/Scene/QuadtreePrimitive.js` (`screenSpaceError`)
- `packages/engine/Source/Scene/QuadtreePrimitive.js` (`screenSpaceError2D`)

## 2. 选择流程

1. 可见性裁剪（frustum/occlusion/fog）
2. 计算 tile 距离与 SSE
3. 若误差超阈值且可细化 -> 细化到子节点
4. 否则渲染当前节点
5. 子未就绪时触发“回退父级”策略（kick）防空洞/闪烁

关键源码：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`

## 3. 工程要点

- 细化前要判 `canRefine`（子可用性），否则会疯狂请求和漏瓦片。
- 队列要分优先级：高（阻塞细化）/中（正在渲染）/低（预取）。
- `preloadAncestors` 和 `preloadSiblings` 应可配置。

