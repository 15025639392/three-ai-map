# Three-Map v2.5 VectorTile 多 tile 边界 Pick 浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 VectorTile 多 tile 场景补齐跨边界邻近区域的 deterministic pick 证据，避免单 tile 交互通过但跨 tile 命中串桶/偏移未被 CI 拦截。

**Architecture:** 新增 `vector-multi-tile-pick-regression` demo，用两个 tile bucket（left/right）分别挂载要素并执行左右 + 边界邻近 pick；smoke 增加断言并落盘 `vector-multi-tile-pick-regression-metrics.json`；metrics baseline 增加 `vectorMultiTilePick` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 multi-tile pick deterministic demo

**Files:**
- Add: `examples/vector-multi-tile-pick-regression.ts`
- Add: `examples/vector-multi-tile-pick-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 构造 left/right 两个 tile bucket 的 point + seam-near point 要素
- 输出左右命中、边界邻近命中、tile bucket 数量与 miss guard 指标
- 同步 demo 列表与构建入口

**Step 2: 运行验证**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

### Task 2: 扩展 smoke 与 baseline

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/map-engine-metrics-baseline.linux.json`
- Modify: `scripts/map-engine-metrics-baseline.macos.json`

**Step 1: 写最小实现**
- smoke 新增 `vector-multi-tile-pick-regression` 断言
- baseline 新增 `vectorMultiTilePick` 断言分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v2.5，多 tile pick 指标纳入门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
