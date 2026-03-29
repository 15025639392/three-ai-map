# Three-Map v2.8 SurfaceTile 坐标转换几何一致性浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `SurfaceTileLayer.coordTransform` 增加 deterministic browser 证据，确保坐标转换会影响几何顶点而不破坏 UV 与瓦片选择一致性。

**Architecture:** 新增 `surface-tile-coord-transform-regression` demo，使用固定 tile 选择与本地 deterministic imagery/elevation loader，对比“无转换”和“带转换”两层 mesh 的 position/uv 差异；smoke 新增断言并落盘 `surface-tile-coord-transform-regression-metrics.json`；metrics baseline 新增 `surfaceCoordTransform` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 coordTransform deterministic demo

**Files:**
- Add: `examples/surface-tile-coord-transform-regression.ts`
- Add: `examples/surface-tile-coord-transform-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 固定一个 tile coordinate，规避相机采样抖动
- 对比 no-transform 与 transform 两层 position/uv attribute
- 输出 `positionDeltaMax`、`uvDeltaMax`、tile-key 一致性与汇总指标

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
- smoke 新增 `surface-tile-coord-transform-regression` 断言
- baseline 新增 `surfaceCoordTransform` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v2.8（13 个 deterministic 场景），补充 coordTransform 门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
