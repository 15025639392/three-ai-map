# Three-Map v3.2 Basic Globe 负载画像浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将“headless smoke 指标与真实业务负载差距”的风险收敛为自动化证据，通过 deterministic 基线/压力双画像回归，持续追踪负载升高时的性能退化斜率与请求放大行为。

**Architecture:** 新增 `basic-globe-load-profile-regression` demo，在同一引擎内依次执行 `baseline profile -> stress profile`，输出双阶段指标与派生比率（FPS ratio、frame-drop delta、scene-object delta、request delta）；smoke 新增断言并落盘 `basic-globe-load-profile-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadProfile` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe 双画像 deterministic 负载 demo

**Files:**
- Add: `examples/basic-globe-load-profile-regression.ts`
- Add: `examples/basic-globe-load-profile-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 先跑 baseline（仅 SurfaceTile）再跑 stress（叠加 marker/polyline/polygon + 更重视角巡航）
- 输出 `baseline*` / `stress*` 指标，以及 `fpsRatio` / `frameDropsDelta` / `sceneObjectDelta` / `imageryRequestedDelta`
- 接入 demo 入口、构建与首页卡片校验

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
- smoke 新增 `basic-globe-load-profile-regression` 断言（双画像指标 + 派生比率）
- baseline 新增 `basicGlobeLoadProfile` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.2（17 个 deterministic 场景），补充 basic-globe 双画像门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
