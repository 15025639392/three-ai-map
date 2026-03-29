# Three-Map v3.1 SurfaceTile 生命周期压力浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 SurfaceTile 生命周期门禁从单轮 add/remove/re-add 提升到多轮压力回归，防止循环切换下出现瓦片残留、场景对象泄漏或重建漂移。

**Architecture:** 新增 `surface-tile-lifecycle-stress-regression` demo，固定 tile 选择并执行 3 轮 `add -> ready -> remove`；输出恢复一致性与清理一致性指标（tile key 恢复计数、remove 清理计数、scene object 稳定性）；smoke 新增断言并落盘 `surface-tile-lifecycle-stress-regression-metrics.json`；metrics baseline 新增 `surfaceLifecycleStress` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 lifecycle-stress deterministic demo

**Files:**
- Add: `examples/surface-tile-lifecycle-stress-regression.ts`
- Add: `examples/surface-tile-lifecycle-stress-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 固定 tile coordinate，循环执行 3 轮 add/remove/re-add
- 输出 `tileKeysRestoredCount`、`removeClearedCount`、`stableSceneObjectCount`、`allExpected`
- 将 demo 接入入口、构建与首页卡片校验

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
- smoke 新增 `surface-tile-lifecycle-stress-regression` 断言
- baseline 新增 `surfaceLifecycleStress` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.1（16 个 deterministic 场景），补充生命周期压力门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
