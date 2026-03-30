# Google Earth 式 Shared Quadtree LOD 设计

## 目标

- 把当前 `TerrainTileLayer` 作为宿主、`RasterLayer` 贴附到宿主 geometry 的模式，升级为 **terrain / imagery 共用同一套 quadtree LOD**。
- 交互时相机先连续运动；渲染端优先保留父节点，子节点就绪后逐步替换。
- 让 `zoom=18` 这类高 zoom 场景不再依赖“粗 terrain host + 更细 imagery overlay”的临时组合。

## 当前问题

- `TerrainTileLayer` 自己选择 active tiles，`RasterLayer` 再根据 host tile 反推 imagery 计划；两者不是同一套 LOD 决策。
- 高 zoom 时，imagery `targetZoom` 可以达到 `18`，但 terrain host 仍可能停在 `14`，视觉细节与手感被宿主几何切分限制。
- 交互预算目前主要压在 imagery 上，terrain 仍会单独做一轮 selection / sampling / scheduling，导致高 zoom 下主线程工作量过大。

## 方案对比

### 方案 A：继续沿用 host 模式，只继续压缩 terrain / imagery 预算

- 优点：改动最小，短期见效快。
- 缺点：架构仍然是“两套 LOD 决策”；高 zoom 体验上限不高，后面补 morph 也会很别扭。

### 方案 B：共享 quadtree LOD + parent fallback，不立即做 geomorph

- 优点：能先把正确的架构骨架搭起来，terrain / imagery 同步细化；父子替换关系清晰，风险可控。
- 缺点：节点切换仍可能有轻微 pop；需要重做 terrain/raster 的计划与状态流。

### 方案 C：一步到位上 shared quadtree + geomorph + parent-child crossfade

- 优点：最接近 Google Earth 式完整体验。
- 缺点：改动面太大，当前代码库没有统一 tile plan 抽象，一次性上全套风险过高。

## 推荐

- 采用 **方案 B 作为一期**。
- 原因很直接：`geomorph` 必须建立在统一 quadtree 节点生命周期之上；没有 shared planner，先上 morph 只会把已有 `host + overlay` 链路做得更复杂。
- 一期先把“谁该显示、谁该请求、谁可降级成父节点”统一起来；二期再补 `geomorph / crossfade`。

## 一期架构

### 1. Shared Planner

- 新增共享的 surface tile planner，输出当前帧的 `TileNodePlan[]`。
- 每个 plan 节点至少包含：
  - `key = z/x/y`
  - `coordinate`
  - `parentKey`
  - `priority`
  - `wantedState = parent | leaf`
  - `interactionPhase`
- planner 是唯一的 LOD 决策源；terrain 和 imagery 都只能消费这份 plan，不能再各自单算一遍。

### 2. Terrain / Imagery 共用节点集

- terrain geometry 与 imagery texture 都挂在同一个节点 key 下。
- geometry 未就绪时，显示父节点 geometry。
- imagery 未就绪时，显示同节点父链上最近可用的 parent imagery。
- 这意味着“高 zoom 视图下仍显示父节点”是显式的过渡状态，而不是现在这种“粗 terrain host 强行承载细 imagery”的副作用。

### 3. 交互与预算

- 交互期降低的是 **refinement depth / request throughput**，不是相机运动。
- planner 在 `interacting` 期：
  - 缩小 refine 范围到视口核心区
  - 限制新 leaf 节点数量
  - 保留父节点直到子节点完整可用
- `idle` 期恢复完整 refine，补齐边缘和高细节节点。

### 4. 渲染策略

- 同一节点：
  - terrain geometry ready + imagery ready -> 直接显示
  - terrain geometry ready + imagery pending -> 用 parent imagery fallback
  - terrain geometry pending -> 保留 parent node
- 一期不做连续 morph，只保证：
  - 不闪洞
  - 不抖动
  - 子节点 ready 后再替换父节点

## 二期：Geomorph / Crossfade（deferred）

- 给 shared quadtree 节点补 `morphFactor`
- terrain 父子节点在重叠期间做 edge morph / crack suppression
- imagery 在父子替换时做短时 crossfade

## 一期非目标

- 不在这一轮实现真正的 Google Earth 级 screen-space-error 误差模型。
- 不在这一轮重写所有 source/cache。
- 不在这一轮做多影像源混合、法线地形或法线贴图。

## 成功标准

- `gaode-satellite` 在 `targetZoom=18` 时，terrain / imagery 的 active leaf 节点来自同一份 plan。
- 交互期只请求视口内优先节点；理想 leaf 未就绪时能稳定显示父节点。
- 松手后能继续细化到高 zoom，不出现瓦片洞、明显错层或大面积闪烁。
- 后续引入 `geomorph` 时，不需要再推翻 shared planner。

## 一期落地状态（2026-03-30）

- 一期已经完成：引擎按帧产出 shared surface tile plan，terrain / imagery 都消费同一份节点计划，并保留 parent fallback 过渡。
- 已通过的定向验证：`npm run typecheck`
- 已通过的定向验证：`npx vitest run tests/tiles/SurfaceTilePlanner.test.ts tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/RasterLayer.test.ts tests/engine/GlobeEngine.test.ts`
- 已通过的定向验证：`GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan`
- 已通过的定向验证：`npm run test:browser:camera-interaction`
- 实际落地差异：Task 4 计划里提到的 `tests/tiles/TileViewport.test.ts` 在仓库中不存在，最终覆盖补在 `tests/layers/RasterLayer.test.ts`
- 实际落地差异：Task 5 实际新增了 `scripts/browser-smoke-gaode-pan.mjs`，并使用已有的 `npm run test:browser:camera-interaction` 作为浏览器回归配对项
- 实际落地差异：`GAODE_PAN_TARGET_ZOOM=18` 的 smoke 目标会被 terrain planner `maxZoom=14` clamp，但仍能稳定证明 shared planner 对齐和 parent fallback/refine 行为
- 实际落地差异：demo smoke harness 通过 `Reflect` 访问私有 engine/layer internals，仅用于调试与取证

## 二期保留项

- `geomorph`
- parent-child crossfade
