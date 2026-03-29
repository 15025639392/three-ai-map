# Three-Map v1.3 多 stage 恢复阈值断言实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v1.2` imagery 阈值门禁基础上，把 browser smoke 扩展到 `tile-load` / `tile-parse` 两个恢复 stage，形成多 stage 自动失败门禁与指标证据。

**Architecture:** 新增 deterministic `surface-tile-recovery-stages-regression` demo，稳定触发 `tile-load` 与 `tile-parse` 恢复查询；`browser-smoke-surface-tile-regression.mjs` 解析并断言 stage 分桶指标上限；`docs/performance` 补充阈值调参依据。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 扩展 deterministic stage 回归 demo

**Files:**
- Add: `examples/surface-tile-recovery-stages-regression.ts`
- Add: `examples/surface-tile-recovery-stages-regression.html`
- Modify: `rspack.config.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`

**Step 1: 写最小实现**
- 新增 stage recovery demo，稳定输出 `tile-load` / `tile-parse` 分桶指标到 DOM dataset
- 把 demo 接入构建入口与 index 列表
- 更新 index 渲染测试用例

**Step 2: 运行目标验证**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

### Task 2: 扩展 smoke 阈值断言

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 写最小实现**
- 新增 stage recovery smoke 检查项（截图、DOM、metrics JSON）
- 对 `tile-load` / `tile-parse` recovery query/hit/rule-hit 增加上限阈值断言

**Step 2: 运行 smoke 验证**

Run: `npm run test:browser:surface-tiles`
Expected: PASS and output `surface-tile-recovery-stages-regression-metrics.json`

### Task 3: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 标记 smoke 已覆盖 imagery/tile-load/tile-parse 恢复阈值
- performance 文档补充多 stage 阈值与调参依据
- checkpoint 更新到 `v1.3` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
