# Google Earth 式 Shared Quadtree LOD 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前 `terrain host + imagery overlay` 模式升级为 terrain / imagery 共用同一套 quadtree LOD，并支持 parent fallback 过渡。

**Architecture:** 在 `src/tiles` 新增 shared surface tile planner，由引擎每帧产出统一节点计划；`TerrainTileLayer` 与 `RasterLayer` 都只消费这份计划，不再各自做独立 LOD 选择。渲染上保留父节点直到子节点 geometry / imagery 可用；一期完成 shared planner + parent fallback，二期补齐 `geomorph / crossfade`。

**Tech Stack:** TypeScript、Three.js、Vitest、现有 deterministic browser smoke

## 执行状态（2026-03-30）

- 一期 6 个任务已经完成，shared quadtree / parent fallback 已按计划落地。
- 已通过的定向验证：`npm run typecheck`
- 已通过的定向验证：`npx vitest run tests/tiles/SurfaceTilePlanner.test.ts tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/RasterLayer.test.ts tests/engine/GlobeEngine.test.ts`
- 已通过的定向验证：`GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan`
- 已通过的定向验证：`npm run test:browser:camera-interaction`

## 二期执行状态（2026-03-31）

- 已完成：`GlobeEngine` 为 shared quadtree 节点下发按时间推进的 `morphFactor`。
- 已完成：`TerrainTileLayer` 接入基于 parent surface 的几何 morph，替代原有硬切换。
- 已完成：`RasterLayer` 接入 parent-child crossfade（旧 mesh 淡出、新 mesh 淡入）。
- 已完成：删除 `RasterLayer` 非 shared-plan 请求规划分支，保留单一 shared quadtree 路径。
- 已通过的定向验证：`npm run typecheck`
- 已通过的定向验证：`npm run build`
- 已通过的定向验证：`GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan`
- 已通过的定向验证：`npm run test:browser:camera-interaction`

---

### Task 1: 引入 shared surface tile planner

**Files:**
- Create: `src/tiles/SurfaceTilePlanner.ts`
- Modify: `src/tiles/SurfaceTileTree.ts`
- Test: `tests/tiles/SurfaceTilePlanner.test.ts`

**Step 1: 写失败测试**

- 覆盖：
  - 同一相机视图下输出稳定的节点 key 集
  - `interacting` 期比 `idle` 期 refine 更浅
  - 节点优先级按视口中心距离排序
  - 每个 leaf 节点都能追溯 parentKey

**Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/tiles/SurfaceTilePlanner.test.ts`
Expected: FAIL，缺少 `SurfaceTilePlanner` 或断言不满足

**Step 3: 写最小实现**

- 新建 planner 抽象，输出统一 `TileNodePlan[]`
- 把目前 `SurfaceTileTree` 里的采样 / expand / focus refine 逻辑沉到 planner 可复用函数
- 明确 `interactionPhase -> planner config`

**Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/tiles/SurfaceTilePlanner.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/tiles/SurfaceTilePlanner.ts src/tiles/SurfaceTileTree.ts tests/tiles/SurfaceTilePlanner.test.ts
git commit -m "feat: 引入共享地表瓦片规划器"
```

### Task 2: 让引擎公开 shared tile plan

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Test: `tests/engine/GlobeEngine.test.ts`

**Step 1: 写失败测试**

- 断言 `LayerContext` 能拿到当前帧 shared tile plan
- 断言交互阶段切换时，shared plan 会随之变化

**Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/engine/GlobeEngine.test.ts -t "shared tile plan"`
Expected: FAIL

**Step 3: 写最小实现**

- 在 `LayerContext` 中新增 `getSurfaceTilePlan?: () => SurfaceTilePlan`
- `GlobeEngine.render()` 中先计算 planner 输出，再喂给 layer update
- 保留现有 interaction phase 状态机

**Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/engine/GlobeEngine.test.ts -t "shared tile plan"`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/Layer.ts src/engine/GlobeEngine.ts tests/engine/GlobeEngine.test.ts
git commit -m "feat: 引擎提供共享瓦片计划上下文"
```

### Task 3: TerrainTileLayer 改为消费 shared tile plan

**Files:**
- Modify: `src/layers/TerrainTileLayer.ts`
- Test: `tests/layers/TerrainTileLayerInteraction.test.ts`
- Test: `tests/layers/TerrainTileLayerGeometry.test.ts`

**Step 1: 写失败测试**

- 断言 terrain 不再自行计算独立 selection
- 断言 `idle / interacting` 下 terrain active node 来自 shared plan
- 断言 parent node 保持可见直到 child geometry ready

**Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/TerrainTileLayerGeometry.test.ts`
Expected: FAIL

**Step 3: 写最小实现**

- 删除 terrain 内部对默认 tile selector 的直接调用路径
- 改为从 shared plan 中读取当前应显示的 node keys
- 为 terrain 节点增加 `displayState = parentFallback | readyLeaf`
- 保持现有 skirt / crack mask 机制

**Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/TerrainTileLayerGeometry.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/TerrainTileLayer.ts tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/TerrainTileLayerGeometry.test.ts
git commit -m "feat: 地形层接入共享四叉树计划"
```

### Task 4: RasterLayer 改为消费 shared tile plan + parent fallback

**Files:**
- Modify: `src/layers/RasterLayer.ts`
- Test: `tests/layers/RasterLayer.test.ts`
- Test: `tests/layers/RasterLayer.test.ts`（补齐 shared-plan / parent fallback / mixed-depth frontier 覆盖）

**Implementation note:** 仓库里没有 `tests/tiles/TileViewport.test.ts`，最终相关覆盖落在 `tests/layers/RasterLayer.test.ts`。

**Step 1: 写失败测试**

- 断言 imagery 不再以 terrain host zoom 为唯一基准
- 断言 leaf imagery 未就绪时，会向 parent 链 fallback
- 断言交互期只优先请求 shared plan 中的可见 leaf / parent

**Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/layers/RasterLayer.test.ts`
Expected: FAIL

**Step 3: 写最小实现**

- 让 `RasterLayer` 直接按 shared node key 构造 request plan
- imagery 节点目标 zoom 取当前 shared node zoom
- detail 请求改成“本节点理想 imagery + parent fallback”模式
- 保留中心优先调度

**Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/layers/RasterLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/RasterLayer.ts tests/layers/RasterLayer.test.ts
git commit -m "feat: 栅格层接入共享四叉树与父级过渡"
```

### Task 5: 更新高德回归页与浏览器取证

**Files:**
- Modify: `examples/gaode-satellite.ts`
- Create: `scripts/browser-smoke-gaode-pan.mjs`
- Test: `test-results/gaode-satellite-drag-smoke.html`
- Test: `test-results/gaode-satellite-drag-smoke.png`

**Step 1: 写失败断言**

- 断言 terrain / imagery 的 active leaf zoom 来自同一 shared plan
- 断言 `targetZoom=18` 时，交互期显示 parent fallback，idle 后补齐 leaf

**Step 2: 运行 smoke 并确认失败**

Run: `GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan`
Expected: FAIL，缺少 unified plan 指标或断言不成立

**Step 3: 写最小实现**

- 给 demo 输出 shared node 统计
- 浏览器 smoke 校验 parent fallback / leaf refine 切换

**Step 4: 运行 smoke 并确认通过**

Run: `GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan`
Expected: PASS，并生成新的 DOM / PNG 证据

**Step 5: 提交**

```bash
git add examples/gaode-satellite.ts scripts/browser-smoke-gaode-pan.mjs test-results/gaode-satellite-drag-smoke.html test-results/gaode-satellite-drag-smoke.png
git commit -m "test: 补齐共享四叉树高德高缩放取证"
```

### Task 6: 做一次一期收口验证

**Files:**
- Modify: `docs/plans/2026-03-30-google-earth-shared-quadtree-design.md`
- Modify: `docs/plans/2026-03-30-google-earth-shared-quadtree.md`

**Step 1: 跑定向验证**

Run: `npm run typecheck`
Expected: PASS

**Step 2: 跑核心单测**

Run: `npx vitest run tests/tiles/SurfaceTilePlanner.test.ts tests/layers/TerrainTileLayerInteraction.test.ts tests/layers/RasterLayer.test.ts tests/engine/GlobeEngine.test.ts`
Expected: PASS

**Step 3: 跑浏览器回归**

Run: `GAODE_PAN_TARGET_ZOOM=18 npm run test:browser:gaode-pan && npm run test:browser:camera-interaction`
Expected: PASS

**Step 4: 更新设计文档中的一期完成状态**

- 补充实际落地差异：
  - Task 4 原计划引用 `tests/tiles/TileViewport.test.ts`，实际覆盖落在 `tests/layers/RasterLayer.test.ts`
  - Task 5 原计划引用缺失的 smoke 脚本路径，实际新增了 `scripts/browser-smoke-gaode-pan.mjs`
  - 浏览器回归配对项实际使用仓库已有的 `npm run test:browser:camera-interaction`
  - `GAODE_PAN_TARGET_ZOOM=18` 在 demo smoke 中最终受 terrain planner `maxZoom=14` 限制，但仍能稳定证明 shared plan 对齐以及 parent fallback -> leaf refine 的切换
  - smoke harness 通过 `Reflect` 读取私有 engine/layer internals 做调试取证
- 二期项已落地：`geomorph`、parent-child crossfade

**Step 5: 提交**

```bash
git add docs/plans/2026-03-30-google-earth-shared-quadtree-design.md docs/plans/2026-03-30-google-earth-shared-quadtree.md
git commit -m "docs: 完成共享四叉树一期计划收口"
```
