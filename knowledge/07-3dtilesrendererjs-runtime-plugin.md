# 07 3DTilesRendererJS Runtime Plugin

## 1. 目标与边界

本章解决两个落地问题：

1. 如何借鉴 3DTilesRendererJS 的 runtime 内核能力（遍历、调度、缓存、状态机）
2. 如何把这些能力以“插件化边界”接入地球引擎，而不污染核心架构

本章聚焦 3D Tiles runtime 本身，不讨论地球 surface 细节。

---

## 2. 3DTilesRendererJS 的分层价值

3DTilesRendererJS 的核心是“内核与引擎适配分离”：

1. `TilesRendererBase`（core）
2. `TilesRenderer`（three 适配）
3. `core/three plugins`（能力扩展层）

关键价值：

- 把下载、解析、遍历、可见性、缓存从 three 场景逻辑里剥离
- 让认证、隐式分块、调试、压缩等能力以插件方式注入

关键源码：

- `src/core/renderer/tiles/TilesRendererBase.js`
- `src/three/renderer/tiles/TilesRenderer.js`
- `src/core/plugins/*`
- `src/three/plugins/*`

---

## 3. `TilesRendererBase` 的职责边界

`TilesRendererBase` 负责：

1. 维护 tile 树与遍历状态
2. 管理下载/解析/处理队列
3. 管理 LRU 缓存和内存预算
4. 提供插件钩子与事件总线

它不负责：

- three.js 具体 mesh 构建细节（由适配层和插件扩展）

这与“内核持有状态、适配层持有渲染细节”的正规架构一致。

---

## 4. 关键状态语义（可直接迁移）

运行时把 tile 拆成两套状态：

1. **内部生命周期状态**：`UNLOADED / QUEUED / LOADING / PARSING / LOADED / FAILED`
2. **逐帧遍历状态**：`used / visible / inFrustum / error / distanceFromCamera / usedLastFrame`

意义：

- 生命周期状态驱动请求与回收
- 遍历状态驱动选择与优先级
- 二者分离可避免“渲染状态覆盖加载状态”的混乱

---

## 5. 三队列模型（download / parse / process）

runtime 默认三条异步队列并行：

1. 下载队列（I/O）
2. 解析队列（CPU）
3. 处理队列（后处理/节点建模）

这比单队列更稳定，因为：

- 限制了每个阶段的并发瓶颈
- 避免下载阶段挤爆解析阶段

相关实现：

- `PriorityQueue`（并发、排序、可移除）
- 多队列协同于 `TilesRendererBase.update()`

---

## 6. 优先级与策略开关

runtime 支持两类加载策略：

1. 默认策略（父/兄弟更保守，保证过渡）
2. `optimizedLoadStrategy`（更强调当前视角效率）

并带 `loadSiblings` 等开关控制“是否预载兄弟块”。

工程启示：

- 策略开关必须明确兼容边界，不能静默互相叠加
- 某些插件与优化策略互斥时要在文档和代码里硬限制

---

## 7. LRUCache 的工程价值（不是简单 Map）

`LRUCache` 提供：

1. item 数量上限（`minSize/maxSize`）
2. 字节预算上限（`minBytesSize/maxBytesSize`）
3. used/loaded 双集合管理
4. 卸载优先级回调（`unloadPriorityCallback`）

这是“可控内存 + 可控回收顺序”的关键能力。

对应实现：

- `src/core/renderer/utilities/LRUCache.js`

---

## 8. 插件系统：钩子契约而非侵入改写

插件通过标准钩子注入行为，常见钩子：

1. `init`
2. `preprocessURL`
3. `fetchData`
4. `parseTile`
5. `disposeTile`
6. `setTileVisible`
7. `setTileActive`

调用模式：

- `invokeOnePlugin`：首个命中即返回（如 fetch/parse）
- `invokeAllPlugins`：广播式调用（如 URL 预处理、事件扩展）

注册机制：

- `registerPlugin` 按 `priority` 插入
- `unregisterPlugin` 负责释放

核心约束：

- 插件可以“扩展行为”，不能“篡改核心状态机”

---

## 9. 典型插件能力图谱

`core/plugins` 常见能力：

- `CesiumIonAuthPlugin` / `GoogleCloudAuthPlugin`（认证与会话）
- `ImplicitTilingPlugin`（3D Tiles 1.1 implicit tiling）
- `EnforceNonZeroErrorPlugin`（几何误差纠正）

`three/plugins` 常见能力：

- `DebugTilesPlugin`（可视化诊断）
- `TileCompressionPlugin` / `TileFlatteningPlugin`（几何处理）
- `LoadRegionPlugin`（区域加载）
- `BatchedTilesPlugin`（批渲染降 draw call）

工程结论：

- 把“平台相关能力”做成插件，比塞进内核更可维护

---

## 10. 事件与可观测性（生产必需）

runtime 暴露事件链：

- `tiles-load-start`
- `tiles-load-end`
- `tile-download-start`
- `load-content`
- `load-model`
- `dispose-model`
- `tile-visibility-change`
- `needs-update`
- `load-error`

这些事件对引擎整合很关键：

1. 性能统计（加载阶段占比）
2. UI 状态（加载中/完成）
3. 故障诊断（哪类 URL/解析失败）

---

## 11. 与 three-map 的干净集成策略

遵循“不保留旧兼容代码”时，建议：

1. 新建独立 `Oblique/3DTiles Runtime` 子系统，不混入 `SurfaceSystem`
2. 通过统一帧入口调度（engine core -> runtime.update）
3. overlay pass 中提交 3D Tiles drawables
4. 用插件适配认证/URL/解析扩展，不加旧式 if-else 分支

强约束：

- 不允许绕过 runtime 直接在 layer 里发请求
- 不允许“旧加载链 + 插件链”双轨共存

---

## 12. 可迁移模式（推荐）

推荐采用“内核 + 适配 + 插件”三段式：

1. `TilesRuntimeCore`：遍历/队列/LRU/状态机
2. `TilesRuntimeAdapter(three-map)`：场景对象创建、材质绑定、可见性切换
3. `TilesRuntimePlugins`：认证、隐式分块、调试、区域裁剪

这样可以在未来替换渲染后端时保留核心 runtime。

---

## 13. 常见故障与归因

故障 1：插件顺序不对导致 URL 处理失效  
归因：priority 未定义或冲突  
修复：插件优先级规范化，注册时校验

故障 2：内存持续升高  
归因：LRU 字节预算未配置或 unload 回调缺失  
修复：启用 bytes 阈值与释放路径审计

故障 3：加载抖动、可见性闪烁  
归因：策略开关与插件互斥被忽略（如 optimizedLoadStrategy）  
修复：互斥组合在启动时硬报错，不做隐式降级

故障 4：更新不及时  
归因：未监听 `needs-update` 触发重渲染  
修复：runtime 事件直连引擎 requestRender

---

## 14. 验收清单（本章落地标准）

满足以下项可认为 runtime 插件化达标：

1. 3D Tiles 下载/解析/处理三阶段可独立观测
2. 插件可插拔，移除后核心仍可运行
3. 插件不能直接破坏核心状态机
4. 内存预算受控（item + bytes）
5. 与地球引擎主渲染链解耦，无旧兼容双轨

---

## 15. 对应 3DTilesRendererJS 参考源码

- `src/core/renderer/tiles/TilesRendererBase.js`
- `src/core/renderer/utilities/PriorityQueue.js`
- `src/core/renderer/utilities/LRUCache.js`
- `src/core/plugins/API.md`
- `src/three/plugins/API.md`
- `src/three/renderer/tiles/TilesRenderer.js`

建议阅读顺序：

1. 先看 `TilesRendererBase`（状态机 + 钩子 + 事件）
2. 再看 `PriorityQueue/LRUCache`（调度与回收）
3. 最后看 `core/three plugins API`（扩展边界）
