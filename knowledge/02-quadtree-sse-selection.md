# 02 Quadtree SSE Selection

## 1. 目标与边界

本章解决四个核心问题：

1. 如何用 SSE（屏幕空间误差）决定四叉树 tile 是否细化
2. 如何避免“过度细化导致请求爆炸”
3. 如何在子节点未就绪时保证画面不漏、不闪
4. 如何把 Cesium 的选择流程映射到 three-map

本章只讨论选择与调度，不展开 terrain/imagery 解耦细节（见 `03-terrain-imagery-decoupling.md`）。

---

## 2. SSE 判定模型（3D/2D）

## 2.1 3D 模式核心公式

Cesium 的 3D 思路可抽象为：

`sse = (maxGeometricError * drawingBufferHeight) / (distance * sseDenominator)`

其中：

- `maxGeometricError`：该 tile 的几何误差上界
- `drawingBufferHeight`：实际绘制分辨率高度（非 CSS 高度）
- `distance`：相机到 tile 的有效距离
- `sseDenominator`：由相机 FOV 推导的视锥参数

额外修正项通常包括：

- `pixelRatio`（高 DPI 设备）
- 雾/地平线衰减（远处细节抑制）
- 动态 SSE（飞行时放松、静止时收紧）

关键源码参考：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`（`screenSpaceError`）

## 2.2 2D / Columbus View 变体

2D/CV 不再使用纯球面距离近似，通常改为屏幕投影尺度相关计算。
因此 Cesium 单独实现 2D 路径，而不是硬复用 3D 公式。

关键源码参考：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`（`screenSpaceError2D`）

---

## 3. `maxGeometricError` 的层级规律

实用规则：

- level 越高，`maxGeometricError` 越小
- 常见近似是每下钻一级误差减半

工程上不要把这个值散落在 layer 内部，应由 provider 或 quadtree 统一提供：

- `getLevelMaximumGeometricError(level)`

这样选择器才可与地形数据源解耦。

---

## 4. 选择状态机（select / render / refine）

单帧内每个候选 tile 典型经历：

1. 可见性判定（frustum / horizon / fog）
2. 计算 SSE
3. 判断是否需要 refine（`sse > threshold`）
4. 细化前检查 `canRefine`（子存在且可调度）
5. 子未 ready 则触发祖先保留（kick/fallback）
6. 将当前帧渲染集合写入 `renderList`

核心思想：

- “该细化”不等于“现在就能细化显示”
- 可显示性优先于理论最优 LOD

关键源码参考：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`

---

## 5. `canRefine` 不是可选项，是安全阀

没有 `canRefine` 会出现三个问题：

1. 子节点疯狂入队，网络/解码压力陡增
2. 父节点过早退出渲染，出现漏瓦片
3. 父子状态抖动导致闪烁

`canRefine` 的最小判断建议：

- 子节点已创建
- 子节点可请求或已在请求中
- 至少存在可作为本帧 fallback 的祖先链

---

## 6. 请求优先级与队列策略

正规做法不是“单一 FIFO 队列”，而是按渲染价值分层：

1. 高优先级：阻塞当前细化的关键子节点
2. 中优先级：当前正在显示路径上的补齐请求
3. 低优先级：预取（siblings/ancestors/边缘区域）

建议配置项：

- `preloadAncestors`
- `preloadSiblings`
- `maxConcurrentRequests`
- `maxQueueSize`
- aging（老化提升，防止低优先级饿死）

---

## 7. 防闪烁与防空洞的选择约束

## 7.1 父保留规则

当子节点未完整 ready：

- 父节点继续参与本帧渲染
- 子节点可后台加载，但不立即“半成品上屏”

## 7.2 原子替换规则

当子节点达到“可显示集合就绪”：

- 在同一帧切换 parent -> children
- 禁止跨多帧逐个替换导致棋盘闪烁

## 7.3 祖先回退规则

若当前目标 tile 缺资源：

- 沿父链向上找到最近可显示祖先
- 绝不渲染“空白洞位”

---

## 8. 动态收敛策略（交互态 vs 静止态）

Cesium 风格常用“双阈值/双阶段”：

- 交互中：阈值放松（减少请求，优先流畅）
- 静止后：阈值收紧（逐步补细节）

对 three-map 的建议：

- 交互态 `interactionPhase=interacting`
- 一段 idle 延时后切回 `idle`
- 切换时只失效 plan cache，不重置可用祖先渲染链

---

## 9. 参考伪代码（可直接改造成实现）

```ts
function selectTile(tile, frameState) {
  if (!isVisible(tile, frameState)) return CULLED;

  const sse = computeSSE(tile, frameState);
  const shouldRefine = sse > frameState.maximumScreenSpaceError;

  if (!shouldRefine) {
    addRenderable(tile);
    return RENDERED;
  }

  if (!canRefine(tile)) {
    addRenderable(findRenderableAncestor(tile) ?? tile);
    requestChildren(tile, Priority.HIGH);
    return KICKED;
  }

  const readyChildren = getReadyChildren(tile);
  if (readyChildren.length === 4) {
    for (const child of readyChildren) {
      selectTile(child, frameState);
    }
    return REFINED;
  }

  addRenderable(tile); // 父保留
  requestChildren(tile, Priority.HIGH);
  return RENDERED;
}
```

---

## 10. 与当前 three-map 的映射建议

可按以下边界收敛：

- `SurfaceTilePlanner`：只负责选点和目标层级，不直接驱动材质
- `TerrainTileLayer` / `RasterLayer`：提供 readiness 与渲染资产状态
- `SurfaceSystem`：维护 interaction phase、plan cache、idle reset

强约束：

1. planner 不读取 layer 私有 mesh/material 字段
2. layer 不反向控制 planner 阈值
3. fallback 渲染链由 surface 子系统统一维护

---

## 11. 常见错误与修复指北

错误 1：只按“目标 zoom”硬切，不看 readiness  
结果：漏瓦片、黑块、频繁切换  
修复：父保留 + 子 ready 原子替换

错误 2：imagery 跟 terrain 共用同一硬阈值上限  
结果：影像永远达不到 source maxZoom  
修复：独立 imagery LOD，宿主几何与纹理采样解耦

错误 3：每次相机变动都清空全部状态  
结果：抖动、重复请求、缓存命中率低  
修复：仅失效当前 plan，保留祖先链与可复用缓存

---

## 12. 评审清单（本章落地验收）

满足以下项可认为 quadtree 选择已达正规实现：

1. SSE 公式与 2D/3D 路径分离清晰
2. `canRefine` 在细化前被强制检查
3. 子未 ready 时无空洞，且父级仍显示
4. 交互态请求密度明显低于静止态
5. 请求队列具备优先级与老化机制
6. 选择器与渲染资产实现细节解耦

---

## 13. 对应 Cesium 参考源码

- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`
- `packages/engine/Source/Scene/Globe.js`

建议阅读顺序：

1. 先看 `screenSpaceError` / `screenSpaceError2D`
2. 再看 tile 选择主循环与 kick 逻辑
3. 最后看 `TileSelectionResult` 如何表达状态转移
