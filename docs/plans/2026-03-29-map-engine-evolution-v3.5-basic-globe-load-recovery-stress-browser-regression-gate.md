# Three-Map v3.5 Basic Globe 负载恢复压力浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 v3.4 的单轮负载恢复证据基础上，新增多轮 `heavy -> recovery` 压力路径回归，将 overlay 多次叠加与清退后的稳定性纳入自动门禁，进一步收敛“headless 与真实业务负载差距”风险。

**Architecture:** 新增 `basic-globe-load-recovery-stress-regression` demo，固定 `3` 轮循环执行 `heavy -> recovery`，输出跨轮聚合指标（`layerRecoveredCount`、`sceneObjectRecoveredCount`、`stableRecoverySceneObjectCount`、FPS ratio min/max）；smoke 新增断言并落盘 `basic-globe-load-recovery-stress-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadRecoveryStress` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe 负载恢复压力 deterministic demo

**Files:**
- Add: `examples/basic-globe-load-recovery-stress-regression.ts`
- Add: `examples/basic-globe-load-recovery-stress-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 在单次 baseline 后执行 3 轮 `heavy -> recovery` 循环
- heavy 阶段叠加 marker/polyline/polygon，recovery 阶段移除 overlay 图层
- 输出跨轮聚合恢复指标与门禁布尔量

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
- smoke 新增 `basic-globe-load-recovery-stress-regression` 断言
- baseline 新增 `basicGlobeLoadRecoveryStress` 分组并接入 diff 报告

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`  
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.5（20 个 deterministic 场景）
- 补充多轮负载恢复压力门禁口径与指标样例

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`  
Expected: PASS
