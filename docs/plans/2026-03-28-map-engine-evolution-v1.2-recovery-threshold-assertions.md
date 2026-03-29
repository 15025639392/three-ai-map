# Three-Map v1.2 恢复指标阈值断言实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v1.1` 的恢复指标输出基础上，为 browser smoke 增加恢复指标阈值断言，避免恢复查询/命中异常放大而缺乏自动预警。

**Architecture:** 继续复用 `surface-tile-zoom-regression` 指标输出与 `browser-smoke-surface-tile-regression.mjs` 断言入口，不新增测试基建；在 smoke 脚本对 imagery stage 的 `query/hit` 增加上限阈值校验，并保留指标 JSON 产物用于回归对照。

**Tech Stack:** `TypeScript`, `node`, `vitest`

---

### Task 1: 增加阈值断言

**Files:**
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`

**Step 1: 写最小实现**
- 增加 imagery stage 恢复 query/hit 的上限常量
- 在 zoom regression 的 DOM 断言里接入阈值校验
- 保持 metrics JSON 输出结构兼容

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS

### Task 2: 文档收口

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 标记 zoom smoke 已覆盖恢复阈值断言
- checkpoint 更新到 `v1.2` 收口并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
