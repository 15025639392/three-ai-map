# Three-Map v2.3 VectorTile Pick 浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 VectorTile 交互链路补齐 deterministic browser pick 证据，避免出现“渲染正常但拾取结果退化”且 CI 未拦截的回归。

**Architecture:** `VectorTileLayer` 实现 `pick` 并返回 `vector-feature` 命中结果；新增 `vector-pick-regression` demo 输出 center/miss pick 指标；smoke 与 metrics baseline 新增断言与指标落盘。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: VectorTileLayer pick 能力

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/layers/VectorTileLayer.ts`
- Modify: `tests/layers/VectorTileLayer.test.ts`
- Modify: `tests/engine/GlobeEngine.test.ts`

**Step 1: 写最小实现**
- `Layer` 增加 `vector-feature` pick result 类型
- `VectorTileLayer` 增加 raycaster pick 路径（point/line/polygon 统一命中）
- 补层级测试与引擎集成测试，验证 center pick 优先返回 vector-feature

**Step 2: 运行目标验证**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts tests/engine/GlobeEngine.test.ts`
Expected: PASS

### Task 2: 新增 vector pick deterministic browser gate

**Files:**
- Add: `examples/vector-pick-regression.ts`
- Add: `examples/vector-pick-regression.html`
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `rspack.config.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- demo 输出 center pick/miss pick 指标（命中类型、要素身份、miss 非 vector-feature）
- smoke 新增 `vector-pick-regression` 检查项并落盘 `vector-pick-regression-metrics.json`
- 同步 demo 列表、构建入口与首页测试

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and output vector pick smoke artifacts

### Task 3: baseline 与文档收口

**Files:**
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/map-engine-metrics-baseline.linux.json`
- Modify: `scripts/map-engine-metrics-baseline.macos.json`
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- baseline 新增 `vectorPick` 断言分组
- README/performance/checkpoint 更新到 v2.3

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
