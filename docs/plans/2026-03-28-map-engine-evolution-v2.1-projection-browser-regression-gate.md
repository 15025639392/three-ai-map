# Three-Map v2.1 投影一致性浏览器门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为坐标转换链路（WGS84/GCJ02/BD09）补齐 deterministic browser regression 证据，避免投影转换精度退化在 CI 中漏检。

**Architecture:** 新增 `projection-regression` demo，输出三条 round-trip 最大误差（米）；在 browser smoke 断言误差上限并落盘 `projection-regression-metrics.json`。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 新增 projection deterministic demo

**Files:**
- Add: `examples/projection-regression.ts`
- Add: `examples/projection-regression.html`
- Modify: `rspack.config.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 基于固定城市样本计算 WGS/GCJ/BD round-trip 误差
- 输出 DOM dataset（`maxWgsGcjWgsErrorMeters` / `maxGcjBdGcjErrorMeters` / `maxWgsBdWgsErrorMeters`）
- 接入 demo 列表、构建入口与首页测试

**Step 2: 运行目标验证**

Run: `npm run test:run -- tests/main.test.ts tests/spatial/CoordinateTransform.test.ts`
Expected: PASS

### Task 2: 扩展 smoke 门禁

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 写最小实现**
- 新增 `projection-regression` smoke 检查项
- 对三条 round-trip 误差施加上限断言
- 落盘 `projection-regression-metrics.json`

**Step 2: 运行验证**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and output projection smoke artifacts

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README/performance 增加 projection browser gate 与阈值说明
- checkpoint 更新到 `v2.1` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
