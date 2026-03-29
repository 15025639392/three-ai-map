# Three-Map v0.8 引擎级恢复策略入口实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v0.7` 的图层重试与降级能力之上，引入 `GlobeEngine` 统一恢复策略入口，让维护者可以按 `stage/category/severity` 全局覆盖图层默认恢复行为（首期覆盖 `SurfaceTileLayer imagery`）。

**Architecture:** 在 `GlobeEngineOptions` 增加 `recoveryPolicy`，由引擎在 `LayerContext` 暴露 `resolveRecovery`。`SurfaceTileLayer` 在 imagery 请求前动态解析恢复配置并合并本地默认项，保持旧 API 向后兼容。

**Tech Stack:** `TypeScript`, `vitest`

---

### Task 1: 写引擎策略失败测试

**Files:**
- Modify: `tests/engine/EventSystem.test.ts`

**Step 1: 写失败测试**
- 引擎 `recoveryPolicy` 可提升 `SurfaceTileLayer` imagery 重试预算，临时失败可恢复成功
- 策略可按 `stage/category/severity` 分流，只命中 `network + warn + imagery` 规则
- 命中 fallback 时，错误事件仍携带 `attempts/fallbackUsed`

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts`
Expected: FAIL because 引擎尚未向图层提供恢复策略解析入口

### Task 2: 实现引擎级策略入口

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/engine/EngineOptions.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `src/index.ts`

**Step 1: 写最小实现**
- `LayerContext` 增加 `resolveRecovery` 回调与恢复配置类型
- `GlobeEngineOptions` 增加 `recoveryPolicy`（`defaults + rules`）
- `GlobeEngine` 实现规则匹配与覆盖合并，按 layer context 注入
- `SurfaceTileLayer` 在 imagery 加载时按 query 合并引擎策略与本地图层默认值
- 导出新增类型，保持外部可配置与可消费

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts tests/layers/SurfaceTileLayer.test.ts`
Expected: PASS

### Task 3: 文档与门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 增加 `recoveryPolicy` 用法与导出类型
- checkpoint 记录 `v0.8` 收口与下一步目标

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
