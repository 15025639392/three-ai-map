# Three-Map v3.0 SurfaceTile 生命周期浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 SurfaceTile 图层的 add/remove/re-add 生命周期补充 deterministic browser 证据，确保释放与重建路径稳定，避免瓦片残留、渲染对象泄漏和状态错乱。

**Architecture:** 新增 `surface-tile-lifecycle-regression` demo，固定 tile 选择并执行“首次加载 -> remove -> re-add”流程；输出 before/remove/re-add 三段指标（tile key、active tile count、group presence、globe 可见性）；smoke 新增断言并落盘 `surface-tile-lifecycle-regression-metrics.json`；metrics baseline 新增 `surfaceLifecycle` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 SurfaceTile lifecycle deterministic demo

**Files:**
- Add: `examples/surface-tile-lifecycle-regression.ts`
- Add: `examples/surface-tile-lifecycle-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 固定 tile coordinate，避免相机采样抖动
- 输出首次加载、remove 后、re-add 后的生命周期指标
- 将 demo 接入入口、构建和卡片校验

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
- smoke 新增 `surface-tile-lifecycle-regression` 断言
- baseline 新增 `surfaceLifecycle` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.0（15 个 deterministic 场景），补充 SurfaceTile 生命周期门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
