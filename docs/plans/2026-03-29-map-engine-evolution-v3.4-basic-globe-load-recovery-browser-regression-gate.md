# Three-Map v3.4 Basic Globe 负载恢复浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 v3.3 负载阶梯门禁继续收敛“headless 与真实业务负载差异”风险，将 heavy 负载后的 overlay 清退恢复路径纳入 deterministic 自动化证据，确保 layer 与 scene object 能回落到 baseline 级别。

**Architecture:** 新增 `basic-globe-load-recovery-regression` demo，在同一引擎内顺序执行 `baseline -> heavy -> recovery` 三段负载；在 `recovery` 阶段主动移除 `markers/polylines/polygons` 图层并输出恢复指标（`layerRecovered`、`sceneObjectRecovered`、FPS 比率）；smoke 新增断言并落盘 `basic-globe-load-recovery-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadRecovery` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe 负载恢复 deterministic demo

**Files:**
- Add: `examples/basic-globe-load-recovery-regression.ts`
- Add: `examples/basic-globe-load-recovery-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 构建 `baseline -> heavy -> recovery` 三段序列
- heavy 阶段叠加 marker/polyline/polygon，recovery 阶段移除 overlay 图层
- 输出分段 FPS / frame drops / imagery requested / render count / layerCount / sceneObjectCount 与恢复布尔指标

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
- smoke 新增 `basic-globe-load-recovery-regression` 断言
- baseline 新增 `basicGlobeLoadRecovery` 分组并接入 diff 报告

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`  
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.4（19 个 deterministic 场景）
- 补充负载恢复门禁口径与指标样例

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`  
Expected: PASS
