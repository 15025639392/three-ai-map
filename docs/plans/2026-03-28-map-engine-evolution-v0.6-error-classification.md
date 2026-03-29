# Three-Map v0.6 错误分类实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v0.5` 的统一错误事件基础上补齐“错误分类与严重级别”，让引擎事件可直接用于告警、降噪和恢复策略分流。

**Architecture:** 保持当前 `LayerContext.reportError -> GlobeEngineEvents.error` 链路不变，只扩展 `LayerErrorPayload` 字段。图层侧根据失败语义填充 `category/severity`，测试侧收紧为单一协议断言，避免 `stage/phase` 双口径漂移。

**Tech Stack:** `TypeScript`, `vitest`

---

### Task 1: 写错误分类失败测试

**Files:**
- Modify: `tests/engine/EventSystem.test.ts`
- Modify: `tests/layers/SurfaceTileLayer.test.ts`
- Modify: `tests/layers/ElevationLayer.test.ts`

**Step 1: 写失败测试**
- `SurfaceTileLayer` 错误事件包含 `category: network`、`severity: warn`
- `ElevationLayer` tile load 错误包含 `category: network`、`severity: warn`
- 自定义 layer 透传错误包含 `category/severity`

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts tests/layers/SurfaceTileLayer.test.ts tests/layers/ElevationLayer.test.ts`
Expected: FAIL because payload 尚未包含分类和严重级别

### Task 2: 实现分类与级别

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `src/layers/ElevationLayer.ts`
- Modify: `src/index.ts`

**Step 1: 写最小实现**
- 在 `LayerErrorPayload` 增加 `category`、`severity`
- `SurfaceTileLayer` 填充网络错误与同步阶段兜底分类
- `ElevationLayer` 区分 tile-load 与 sampler-build 的分类/级别
- 导出新增类型，确保外部可消费

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts tests/layers/SurfaceTileLayer.test.ts tests/layers/ElevationLayer.test.ts`
Expected: PASS

### Task 3: 文档与门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 同步错误事件 payload 示例
- checkpoint 记录 v0.6 分类能力已落地

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
