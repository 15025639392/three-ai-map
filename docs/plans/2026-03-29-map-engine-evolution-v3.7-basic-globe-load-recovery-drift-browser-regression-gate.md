# Three-Map v3.7 Basic Globe 负载恢复漂移浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 v3.6 的负载恢复耐久证据基础上，新增 `heavy -> recovery` 跨轮漂移约束回归，把恢复一致性在多轮交互中的稳定性进一步收敛到自动门禁。

**Architecture:** 接入 `basic-globe-load-recovery-drift-regression` demo，复用 5 轮 `heavy -> recovery` 压力路径并固化恢复计数、tile 稳定性、交互步数和 FPS ratio 约束；smoke 新增断言并落盘 `basic-globe-load-recovery-drift-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadRecoveryDrift` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 接入 basic-globe 负载恢复漂移 deterministic demo

**Files:**
- Add: `examples/basic-globe-load-recovery-drift-regression.ts`
- Add: `examples/basic-globe-load-recovery-drift-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 在 demo 列表与构建入口接入 drift 页面
- 在索引回归测试覆盖 drift demo 文案和跳转

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
- smoke 新增 `basic-globe-load-recovery-drift-regression` 断言
- baseline 新增 `basicGlobeLoadRecoveryDrift` 分组并接入 diff 报告

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`  
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.7（22 个 deterministic 场景）
- 补充负载恢复漂移门禁口径与指标样例

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`  
Expected: PASS
