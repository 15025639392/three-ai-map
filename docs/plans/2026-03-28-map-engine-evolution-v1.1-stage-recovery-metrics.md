# Three-Map v1.1 恢复策略分桶指标实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v1.0` 跨图层恢复接缝基础上，补齐按 `stage` 分桶的恢复命中指标，并把指标接入 deterministic zoom baseline 输出，形成可回归对照证据。

**Architecture:** `GlobeEngine.resolveLayerRecovery` 在全局计数之外维护 stage 维度统计并写入 `PerformanceMonitor.metrics`。`surface-tile-zoom-regression` 在收口时导出恢复策略指标到 DOM dataset，browser smoke 校验并持久化到 metrics JSON，`docs/performance` 同步记录基线值。

**Tech Stack:** `TypeScript`, `vitest`, `node`

---

### Task 1: 写分桶指标失败测试

**Files:**
- Modify: `tests/engine/EventSystem.test.ts`

**Step 1: 写测试**
- imagery / tile-load / tile-parse 三类策略命中测试中，分别断言 stage 分桶指标存在并递增

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts`
Expected: FAIL because 当前只有全局恢复指标

### Task 2: 实现分桶指标

**Files:**
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写最小实现**
- 在引擎维护 `Map<stage, {query/hit/ruleHit}>`
- 每次恢复解析同步更新全局指标与 stage 分桶指标
- `resetPerformanceReport()` 重置分桶状态

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts tests/layers/VectorTileLayer.test.ts tests/layers/ElevationLayer.test.ts`
Expected: PASS

### Task 3: 接入基线输出

**Files:**
- Modify: `examples/surface-tile-zoom-regression.ts`
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 接入输出**
- zoom regression 把恢复指标写入 DOM dataset
- browser smoke 校验并写入 `surface-tile-zoom-regression-metrics.json`

**Step 2: 运行验证**

Run: `npm run test:map-engine`
Expected: PASS and metrics JSON contains recovery policy fields

### Task 4: 文档收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 增加 stage 分桶指标说明
- baseline 文档补充恢复指标基线值
- checkpoint 更新到 `v1.1`，给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
