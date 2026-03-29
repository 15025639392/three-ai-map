# Three-Map v0.9 Elevation 恢复策略与命中指标实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v0.8` 引擎级恢复策略入口基础上，把恢复接缝扩展到 `ElevationLayer` 的 `tile-load` 链路，并补齐引擎级策略命中指标，形成可观测的恢复闭环。

**Architecture:** 保持 `LayerContext.resolveRecovery` 作为唯一恢复查询入口。`ElevationLayer` 在 tile 请求阶段按 `stage=tile-load/category=network/severity=warn` 解析并应用 retry 配置；`GlobeEngine` 在策略解析时累计 query/hit/rule-hit 指标并写入 `PerformanceMonitor`。

**Tech Stack:** `TypeScript`, `vitest`

---

### Task 1: 写失败测试

**Files:**
- Modify: `tests/layers/ElevationLayer.test.ts`
- Modify: `tests/engine/EventSystem.test.ts`

**Step 1: 写失败测试**
- `ElevationLayer` 能通过 `LayerContext.resolveRecovery` 获取 retry 覆盖，临时失败可恢复
- `GlobeEngine` 的 `recoveryPolicy` 可驱动 `ElevationLayer tile-load` 重试成功
- 策略解析后 `PerformanceReport.metrics` 含命中指标（query/hit/rule-hit）

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/ElevationLayer.test.ts tests/engine/EventSystem.test.ts`
Expected: FAIL because Elevation 尚未接入恢复策略且无策略命中指标

### Task 2: 实现恢复与观测

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/layers/ElevationLayer.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Step 1: 写最小实现**
- 扩展 `LayerRecoveryOverrides`（增加 elevation retry 配置）
- `ElevationLayer` 增加 `elevationRetryAttempts/elevationRetryDelayMs`，并在 tile-load 阶段应用 recover 配置
- 错误上报 metadata 补充 `attempts`
- `GlobeEngine` 在策略解析时累计并上报命中指标

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/ElevationLayer.test.ts tests/engine/EventSystem.test.ts`
Expected: PASS

### Task 3: 文档与门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 增加 Elevation 策略覆盖示例和策略命中指标说明
- checkpoint 记录 `v0.9` 收口与下一步

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
