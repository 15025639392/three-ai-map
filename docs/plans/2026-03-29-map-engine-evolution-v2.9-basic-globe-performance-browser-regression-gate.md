# Three-Map v2.9 Basic Globe 性能回归浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将验收矩阵 A4 从手动观测升级为 deterministic browser gate，稳定覆盖 basic-globe 风格的 pan/zoom 性能与瓦片请求取消行为。

**Architecture:** 新增 `basic-globe-performance-regression` demo，使用本地 deterministic imagery/elevation loader + 固定视角序列，输出 before/after tile key、FPS、frame drops、请求取消率及场景复杂度指标；smoke 新增断言并落盘 `basic-globe-performance-regression-metrics.json`；metrics baseline 新增 `basicGlobePerformance` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe deterministic 性能 demo

**Files:**
- Add: `examples/basic-globe-performance-regression.ts`
- Add: `examples/basic-globe-performance-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 新增 deterministic `basic-globe` 风格场景（SurfaceTile + marker/polyline/polygon）
- 固定视角巡航（pan + zoom）并输出性能与请求指标
- 将 demo 接入入口、构建与索引页校验

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
- smoke 新增 `basic-globe-performance-regression` 断言
- baseline 新增 `basicGlobePerformance` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v2.9（14 个 deterministic 场景），补充 basic-globe 性能门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
