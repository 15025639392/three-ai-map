# Three-Map v0.3 收口实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 继续兑现 docs 中“核心稳固 + 性能提升”的剩余缺口：增加第三个 deterministic 缩放回归场景，补充可复跑的 SurfaceTile 性能基线输出，并把结果沉淀到文档与统一验证入口。

**Architecture:** 不引入新的重渲染架构，只在现有 `SurfaceTileLayer -> TileScheduler -> browser smoke` 链路上增加统计与证据输出。缩放回归继续使用 deterministic 本地 tile 数据，性能基线通过同一浏览器场景采集 FPS / frame drops / tile request waste 指标。

**Tech Stack:** `TypeScript`, `three`, `vitest`, `Rspack`, `headless Chrome`

---

### Task 1: 增加调度与图层统计

**Files:**
- Modify: `src/tiles/TileScheduler.ts`
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `tests/tiles/TileScheduler.test.ts`
- Modify: `tests/layers/SurfaceTileLayer.test.ts`

**Step 1: 写失败测试**
- 校验 `TileScheduler` 能输出 requested / started / succeeded / cancelled / deduplicated 统计
- 校验 `SurfaceTileLayer` 在过期取消后能暴露 imagery/elevation 调度统计

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/tiles/TileScheduler.test.ts tests/layers/SurfaceTileLayer.test.ts`
Expected: FAIL because stats API does not exist

**Step 3: 写最小实现**
- `TileScheduler.getStats()`
- `SurfaceTileLayer.getDebugStats()`

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/tiles/TileScheduler.test.ts tests/layers/SurfaceTileLayer.test.ts`
Expected: PASS

---

### Task 2: 增加第三个 deterministic 缩放回归场景

**Files:**
- Create: `examples/surface-tile-zoom-regression.ts`
- Create: `examples/surface-tile-zoom-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 写失败测试**
- 首页 demo 列表新增 `Surface Tile Zoom Regression`

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/main.test.ts`
Expected: FAIL because zoom regression demo card is missing

**Step 3: 写最小实现**
- 新增缩放回归 demo
- smoke 脚本新增第三条检查
- 产出对应截图 / DOM / metrics 文件

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

---

### Task 3: 产出性能基线文档

**Files:**
- Create: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `README.md`

**Step 1: 跑基线场景**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and generate baseline metrics output

**Step 2: 写文档**
- 记录执行日期、命令、场景、FPS、frame drops、active tiles、request cancel ratio、截图 / DOM / metrics 文件路径
- 明确当前 bundle size warning 仍是后续优化项

**Step 3: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
