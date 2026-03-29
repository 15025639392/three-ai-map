# Three-Map v3.6 Basic Globe 负载恢复耐久浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 v3.5 的多轮恢复压力证据基础上，新增更长时长的 `heavy -> recovery` 交互压力路径回归，把交互步数、tile 稳定性和 render 回落一致性纳入自动门禁，进一步收敛“headless 与真实业务负载差距”风险。

**Architecture:** 新增 `basic-globe-load-recovery-endurance-regression` demo，固定 `5` 轮循环执行 `heavy -> recovery`，输出跨轮聚合指标（`layerRecoveredCount`、`sceneObjectRecoveredCount`、`renderRecoveredCount`、`recoveryTileStableCount`、交互步数总量、FPS ratio min）；smoke 新增断言并落盘 `basic-globe-load-recovery-endurance-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadRecoveryEndurance` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe 负载恢复耐久 deterministic demo

**Files:**
- Add: `examples/basic-globe-load-recovery-endurance-regression.ts`
- Add: `examples/basic-globe-load-recovery-endurance-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 在单次 baseline 后执行 5 轮 `heavy -> recovery` 循环
- heavy 阶段叠加 marker/polyline/polygon，recovery 阶段移除 overlay 图层
- 输出跨轮聚合恢复指标、交互步数与 tile 稳定性门禁布尔量

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
- smoke 新增 `basic-globe-load-recovery-endurance-regression` 断言
- baseline 新增 `basicGlobeLoadRecoveryEndurance` 分组并接入 diff 报告

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`  
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.6（21 个 deterministic 场景）
- 补充长时负载恢复耐久门禁口径与指标样例

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`  
Expected: PASS
