# 05 Crack Transition Stability

## 1. 目标与边界

本章解决四类“视觉稳定性”问题：

1. 地形瓦片接缝裂开（crack）
2. 父子替换瞬间闪烁（flicker）
3. 边界/极区出现孔洞或覆盖不完整
4. 过渡阶段出现黑块/灰块/穿刺

本章不讨论请求调度与缓存细节（见 `04-request-scheduling-cache-lifecycle.md`），只聚焦“如何稳定地画出来”。

---

## 2. 裂缝来源分类（先分型再修）

裂缝通常来自四类不一致：

1. **LOD 不一致**：相邻 tile 分辨率不同，边界顶点不共线
2. **数据不一致**：边界采样高度来源不同（父/子或邻接缺失）
3. **几何不一致**：索引拓扑或量化反量化误差不同
4. **时序不一致**：一侧已替换另一侧仍旧网格

结论：

- 单靠 `skirt` 只能遮住部分缝，不能解决全部来源
- 必须引入“邻接传播 + fill + 稳定替换”组合策略

---

## 3. Cesium 的裂缝治理：Skirt + Fill 双机制

## 3.1 `Skirt`（边缘下垂）

作用：

- 在 tile 边缘向下扩展裙边，遮挡细小高差缝隙

局限：

- 无法解决大尺度邻接缺失
- 无法解决父子级差导致的边界拓扑断裂

## 3.2 `TerrainFillMesh`（邻接传播填补）

作用：

- 当邻接 tile 缺失或层级不齐时，按邻接边界信息构建填补网格
- 保证边界与角点可连续，不因单块缺失出现可见洞

这是 Cesium 在大场景稳定性的关键机制。

关键源码：

- `packages/engine/Source/Scene/TerrainFillMesh.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`

---

## 4. 过渡稳定：父保留 + 子原子替换

## 4.1 正规替换规则

1. 子节点未达到“可显示就绪”前，父节点持续渲染
2. 子节点就绪后，同帧原子替换父节点
3. 禁止跨多帧分批替换同一 host 区域

## 4.2 为什么这比“立即切换”更稳定

- 避免一帧内出现“半块父 + 半块子”边界错位
- 避免纹理和几何不同步到达导致闪烁

关键源码：

- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`

---

## 5. 影像过渡稳定：祖先链回退

地形几何就绪不代表目标影像也就绪。
正确做法：

1. host tile 固定
2. 影像优先采样目标级
3. 目标级未就绪时回退最近祖先影像
4. 目标级就绪后在同 host 内更新采样

禁止做法：

- 独立父影像 mesh 覆盖（会引入深度/遮挡竞争）

关键源码：

- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/Imagery.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`

---

## 6. 极区与边界稳定策略

极区问题通常包含三类：

1. WebMercator 高纬采样退化
2. 瓦片边界角点缺失导致“帽子”断面
3. 量化误差在高纬放大

建议策略：

1. 邻接边界传播优先于单父级插值
2. 对边界采样使用 epsilon 扩展，避免精度截断导致漏采样
3. 极区覆盖策略与普通区域分开处理，但输出仍统一走 host tile 渲染链

---

## 7. 防黑块/防灰块（穿刺）规则

黑块/灰块本质是“占位几何先出现，颜色数据未就绪”。

硬规则：

1. tile 若不可着色，不得进入最终可见列表
2. 必须回退到可着色祖先 host
3. 仅当 geometry + imagery 至少一条可用链同时满足时才替换

工程上可以把可渲染定义为：

`renderable = geometryReady && (imageryTargetReady || imageryAncestorReady)`

---

## 8. three-map 落地映射（干净实现）

遵循“不保留旧兼容代码”时，建议直接执行以下收敛：

1. `SurfaceSystem` 统一维护 active host tile 与替换时机
2. `TerrainTileLayer` 仅提供 geometry/fill/skirt 能力，不做独立闪烁补丁
3. `RasterLayer` 仅提供 host 内 imagery chain，不提供独立父影像 mesh
4. 删除任何“旧退场机制/双轨渲染兜底开关”

强约束：

- 不允许 layer 直接操作 `GlobeMesh` 作为 fallback
- 不允许多套替换策略并存（防止状态机分叉）

---

## 9. 实施顺序（建议）

1. 先实现“父保留+子原子替换”状态机
2. 再实现 imagery 祖先链回退
3. 再实现 skirt + fill 协同
4. 最后做极区/边界 epsilon 校准

原因：

- 前两步先消除闪烁与黑块
- 后两步再收敛边界质量

---

## 10. 典型故障与定位

故障 1：接缝细线只在高缩放出现  
归因：邻接 LOD 差 + 无 skirt/fill  
定位：检查边界顶点与邻接层级

故障 2：缩放时棋盘闪烁  
归因：非原子替换  
定位：检查同一帧 parent/children 同时可见

故障 3：局部黑块后恢复  
归因：不可着色 tile 上屏  
定位：检查 renderable 条件是否忽略 imagery 就绪

故障 4：极区帽子断裂  
归因：边界角点插值链不完整  
定位：检查 fill mesh 的 corner/edge 数据来源

---

## 11. 验收清单（本章落地标准）

满足以下项可认为过渡稳定性达标：

1. 连续缩放与平移中无可见裂缝线条持续存在
2. 父子替换过程无交替闪烁
3. 影像加载阶段无黑块/灰块穿刺
4. 极区与高纬区域无明显覆盖缺口
5. 去除旧兼容路径后，单一状态机仍稳定运行

---

## 12. 对应 Cesium 参考源码

- `packages/engine/Source/Scene/TerrainFillMesh.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`
- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`
- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/Imagery.js`

建议阅读顺序：

1. 先看 `QuadtreePrimitive` 的替换逻辑
2. 再看 `GlobeSurfaceTile` 的 renderable 判定
3. 最后看 `TerrainFillMesh` 如何补边界缺失
