# Three-Map v2.2 Terrarium Decode Worker 可观测性门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Terrarium 解码链路补齐 worker 命中率与主线程 fallback 次数指标，并接入 deterministic browser smoke 与 metrics baseline，防止 worker 路径退化后在 CI 中漏检。

**Architecture:** 在 `TerrariumDecoder` 内记录 request/worker-hit/fallback/hit-rate 指标；新增 `terrarium-decode-regression` demo 同时覆盖 worker 与 force-main-thread fallback 两条路径；smoke 与 baseline 增加断言和指标落盘。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: TerrariumDecoder 指标能力

**Files:**
- Modify: `src/tiles/TerrariumDecoder.ts`
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `tests/tiles/TerrariumDecoder.test.ts`

**Step 1: 写最小实现**
- `TerrariumDecoder` 增加 `getStats()` 输出 request/worker-hit/fallback/hit-rate
- 支持 `forceMainThread` 选项，稳定触发 fallback 路径
- `SurfaceTileLayer#getDebugStats()` 透传 terrarium decode 指标
- 补单测覆盖 worker 命中与 fallback 统计

**Step 2: 运行目标验证**

Run: `npm run test:run -- tests/tiles/TerrariumDecoder.test.ts`
Expected: PASS

### Task 2: 新增 Terrarium deterministic browser gate

**Files:**
- Add: `examples/terrarium-decode-regression.ts`
- Add: `examples/terrarium-decode-regression.html`
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `rspack.config.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- demo 同时执行 worker decode 与 forced fallback decode
- 输出两条路径的 request/hit/fallback/hit-rate 指标与 decode signature
- smoke 增加 `terrarium-decode-regression` 断言并落盘 `terrarium-decode-regression-metrics.json`
- 同步 demo 列表、构建入口与首页测试

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and output terrarium smoke artifacts

### Task 3: 基线与文档收口

**Files:**
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/map-engine-metrics-baseline.linux.json`
- Modify: `scripts/map-engine-metrics-baseline.macos.json`
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- baseline 新增 terrariumDecode 区间断言与 diff 报告字段
- README/performance/checkpoint 增加 v2.2 门禁说明与结果

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
