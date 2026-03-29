# Three-Map v1.8 指标门禁诊断增强实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 metrics baseline 断言失败时输出结构化 diff 报告，降低 CI 排障成本。

**Architecture:** `assert-map-engine-metrics-baseline.mjs` 在每次运行都输出 `test-results/map-engine-metrics-baseline-diff.json`，包含状态、基线路径、指标路径和违规项（当前值/阈值/类型）。

**Tech Stack:** `node`, `json`

---

### Task 1: 增强 baseline 断言脚本可诊断性

**Files:**
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`

**Step 1: 写最小实现**
- 将失败项结构化为 `violations` 列表
- 无论通过/失败都落盘 diff 报告 JSON
- 失败日志附带 diff 报告路径

**Step 2: 运行目标验证**

Run: `npm run test:metrics:baseline`
Expected: PASS and output `test-results/map-engine-metrics-baseline-diff.json`

### Task 2: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README/performance 增加 diff 报告路径说明
- checkpoint 更新到 `v1.8` 并收口本轮任务

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
