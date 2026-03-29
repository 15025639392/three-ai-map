# Three-Map v2.4 VectorTile 线面 Pick 浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 point pick 门禁基础上，补齐 VectorTile line/polygon pick 的 deterministic browser 证据，避免交互命中能力只在点要素稳定而线面退化未被 CI 拦截。

**Architecture:** 新增 `vector-geometry-pick-regression` demo，对 point/line/polygon 三类要素分别执行屏幕空间 pick；smoke 增加断言并落盘 `vector-geometry-pick-regression-metrics.json`；metrics baseline 增加 `vectorGeometryPick` 断言分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 Vector geometry pick deterministic demo

**Files:**
- Add: `examples/vector-geometry-pick-regression.ts`
- Add: `examples/vector-geometry-pick-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- demo 构造 point/line/polygon 三类要素
- 通过投影后的屏幕坐标执行 pick，并输出命中 identity 与 miss guard
- 同步 demo 列表与构建入口

**Step 2: 运行验证**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

### Task 2: 扩展 smoke 与 baseline 门禁

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/map-engine-metrics-baseline.linux.json`
- Modify: `scripts/map-engine-metrics-baseline.macos.json`

**Step 1: 写最小实现**
- smoke 新增 `vector-geometry-pick-regression` 断言
- baseline 新增 `vectorGeometryPick` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v2.4，补充线面 pick 门禁口径与结果

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
