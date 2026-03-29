# Three-Map v1.7 CI 平台矩阵与阈值映射实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v1.6` 基线配置外置化基础上，把 CI 从单平台扩展到 `linux + macOS`，并按平台映射独立指标阈值配置。

**Architecture:** `map-engine-checks.yml` 增加 job matrix（`ubuntu-latest`、`macos-latest`）；每个平台通过 `MAP_ENGINE_METRICS_BASELINE_CONFIG` 注入独立 JSON 阈值配置。

**Tech Stack:** `GitHub Actions`, `json`

---

### Task 1: 扩展 CI 矩阵

**Files:**
- Modify: `.github/workflows/map-engine-checks.yml`
- Add: `scripts/map-engine-metrics-baseline.linux.json`
- Add: `scripts/map-engine-metrics-baseline.macos.json`

**Step 1: 写最小实现**
- 增加 `ubuntu-latest` + `macos-latest` matrix
- 平台粒度映射 baseline config 文件
- smoke 产物按平台命名上传，避免覆盖

**Step 2: 本地可验证项**

Run: `npm run test:map-engine`
Expected: PASS

### Task 2: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 补充多平台 CI 与阈值配置映射
- performance 文档补充平台配置文件说明
- checkpoint 更新到 `v1.7` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
