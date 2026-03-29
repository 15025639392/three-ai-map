# Three-Map v2.0 VectorTile 浏览器回归门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在已完成的 VectorTile MVP 单测基础上，补齐 deterministic browser regression 门禁，确保 point/line/polygon 渲染链路具备浏览器证据。

**Architecture:** 新增 `vector-tile-regression` demo（内置 deterministic MVT fixture），在 browser smoke 增加向量回归断言（feature counts + object count），并输出 `vector-tile-regression-metrics.json`。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 VectorTile deterministic demo

**Files:**
- Add: `examples/vector-tile-regression.ts`
- Add: `examples/vector-tile-regression.html`
- Modify: `rspack.config.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 内置 point/line/polygon MVT fixture 并调用 `VectorTileLayer#setTileData`
- 输出 DOM dataset：`point/line/polygon/object` 计数
- 接入 demo 列表、构建入口与首页测试

**Step 2: 运行目标验证**

Run: `npm run test:run -- tests/main.test.ts tests/layers/VectorTileLayer.test.ts`
Expected: PASS

### Task 2: 扩展 smoke 门禁

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 写最小实现**
- 新增 `vector-tile-regression` smoke 检查项
- 断言 `point/line/polygon = 1/1/1` 且 `objectCount >= 3`
- 落盘 `vector-tile-regression-metrics.json`

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and output vector smoke artifacts

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README/performance 增加 VectorTile browser gate 说明
- checkpoint 更新到 `v2.0` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
