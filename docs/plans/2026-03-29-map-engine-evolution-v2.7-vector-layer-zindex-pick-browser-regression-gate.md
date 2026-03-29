# Three-Map v2.7 VectorTile 跨图层 zIndex Pick 优先级浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为跨图层重叠场景补齐 deterministic pick 证据，确保 `LayerManager` 的 zIndex 选择顺序在浏览器门禁下可回归验证。

**Architecture:** 新增 `vector-layer-zindex-pick-regression` demo，构造低/高 zIndex 两个 VectorTileLayer 在同坐标重叠命中，并验证高层隐藏后的回退命中；smoke 新增断言并落盘 `vector-layer-zindex-pick-regression-metrics.json`；metrics baseline 新增 `vectorLayerZIndexPick` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增跨图层 zIndex pick deterministic demo

**Files:**
- Add: `examples/vector-layer-zindex-pick-regression.ts`
- Add: `examples/vector-layer-zindex-pick-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 构造 low/high 两个 VectorTileLayer（同坐标重叠点）
- 输出 top-layer hit 与隐藏 highLayer 后 fallback hit 指标
- 同步 demo 列表和构建入口

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
- smoke 新增 `vector-layer-zindex-pick-regression` 断言与 metrics 落盘
- baseline 新增 `vectorLayerZIndexPick` 分组

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

### Task 3: 单测补强与文档收口

**Files:**
- Modify: `tests/engine/GlobeEngine.test.ts`
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 写最小实现**
- 补 engine 级单测：跨图层 zIndex pick 命中 + 高层隐藏 fallback
- 文档更新到 v2.7（12 个 deterministic 场景）

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
