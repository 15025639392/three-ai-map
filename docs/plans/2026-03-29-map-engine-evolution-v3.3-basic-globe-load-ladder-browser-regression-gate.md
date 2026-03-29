# Three-Map v3.3 Basic Globe 负载阶梯浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 v3.2 双画像基础上继续收敛 headless 指标波动风险，通过 baseline/medium/heavy 三段负载阶梯回归，形成“负载升高时结构与性能关系”的稳定自动化证据。

**Architecture:** 新增 `basic-globe-load-ladder-regression` demo，在同一引擎内按顺序执行 `baseline -> medium -> heavy` 三段画像，输出分段指标与阶梯约束（scene/layer 单调、FPS 比率区间、请求差值区间）；smoke 新增断言并落盘 `basic-globe-load-ladder-regression-metrics.json`；metrics baseline 新增 `basicGlobeLoadLadder` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 basic-globe 负载阶梯 deterministic demo

**Files:**
- Add: `examples/basic-globe-load-ladder-regression.ts`
- Add: `examples/basic-globe-load-ladder-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 构建 baseline/medium/heavy 三段回归序列（逐段叠加图层负载）
- 输出分段 FPS / frame drops / imagery requested / render count / scene object count 与阶梯布尔指标
- 接入 demo 入口、构建与首页校验

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
- smoke 新增 `basic-globe-load-ladder-regression` 断言
- baseline 新增 `basicGlobeLoadLadder` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- 文档更新到 v3.3（18 个 deterministic 场景），补充负载阶梯门禁口径

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
