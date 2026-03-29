# Three-Map v2.6 VectorTile 重叠要素 Pick 优先级浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 VectorTile 重叠要素场景补齐 pick 优先级的 deterministic 证据，确保 `zIndex` 覆盖和近深度兜底命中都能被 CI 自动拦截。

**Architecture:** 在 `VectorTileLayer#pick` 中引入“`zIndex` 优先，`zIndex` 相同按更近 distance”选择规则；新增 `vector-overlap-pick-regression` demo 覆盖重叠点命中；smoke 新增断言并落盘 `vector-overlap-pick-regression-metrics.json`；metrics baseline 新增 `vectorOverlapPick` 分组。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 实现重叠要素 pick 优先级

**Files:**
- Modify: `src/layers/VectorTileLayer.ts`
- Modify: `tests/layers/VectorTileLayer.test.ts`

**Step 1: 写最小实现**
- pick 结果由“命中即返回”调整为候选比较
- 命中候选先按 `zIndex`，再按更近 `distance`
- 补 unit test 覆盖 zIndex 优先与近深度兜底

**Step 2: 运行验证**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: PASS

### Task 2: 新增 overlap pick deterministic demo

**Files:**
- Add: `examples/vector-overlap-pick-regression.ts`
- Add: `examples/vector-overlap-pick-regression.html`
- Modify: `src/main.ts`
- Modify: `rspack.config.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- demo 构造两组重叠点：`zIndex` 冲突组、近深度冲突组
- 输出命中 layer/kind、expected flag、miss guard 指标
- 同步 demo 列表与构建入口

**Step 2: 运行验证**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

### Task 3: 扩展 smoke、baseline 与文档收口

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/map-engine-metrics-baseline.linux.json`
- Modify: `scripts/map-engine-metrics-baseline.macos.json`
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 写最小实现**
- smoke 新增 `vector-overlap-pick-regression` 断言与 metrics 落盘
- baseline 新增 `vectorOverlapPick` 分组
- 文档更新到 `v2.6` 与 11 场景门禁口径

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles && npm run test:metrics:baseline`
Expected: PASS

**Step 3: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
