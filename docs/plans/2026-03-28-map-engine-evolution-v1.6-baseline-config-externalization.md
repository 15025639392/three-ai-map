# Three-Map v1.6 基线配置外置化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 metrics baseline 阈值从脚本内联常量外置为独立配置文件，支持在 CI 通过环境变量切换阈值配置。

**Architecture:** 新增 `scripts/map-engine-metrics-baseline.config.json`；`assert-map-engine-metrics-baseline.mjs` 从配置文件读取阈值并执行校验，支持 `MAP_ENGINE_METRICS_BASELINE_CONFIG` 覆盖默认配置路径。

**Tech Stack:** `node`, `json`

---

### Task 1: 外置 baseline 配置并接入脚本

**Files:**
- Add: `scripts/map-engine-metrics-baseline.config.json`
- Modify: `scripts/assert-map-engine-metrics-baseline.mjs`

**Step 1: 写最小实现**
- 把 zoom/stage recovery 阈值迁移至 JSON 配置
- 增加配置加载与结构校验
- 支持 `MAP_ENGINE_METRICS_BASELINE_CONFIG` 环境变量覆盖路径

**Step 2: 运行目标验证**

Run: `npm run test:metrics:baseline`
Expected: PASS

### Task 2: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 补充 baseline 配置文件与环境变量
- performance 文档补充配置外置化口径
- checkpoint 更新到 `v1.6` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
