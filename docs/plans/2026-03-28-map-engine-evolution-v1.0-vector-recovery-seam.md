# Three-Map v1.0 VectorTile 恢复接缝实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v0.9` 的跨图层恢复能力基础上，把统一恢复接缝扩展到 `VectorTileLayer`，支持 `tile-parse` 阶段按 `stage/category/severity` 命中规则并执行 retry/fallback。

**Architecture:** 保持 `LayerContext.resolveRecovery` 单入口；`VectorTileLayer#setTileData` 在解析阶段应用恢复配置（retry + optional empty fallback），并通过 `LayerContext.reportError` 上报结构化错误；`GlobeEngine` 继续在恢复解析阶段累计命中指标。

**Tech Stack:** `TypeScript`, `vitest`

---

### Task 1: 写恢复规则测试

**Files:**
- Modify: `tests/layers/VectorTileLayer.test.ts`
- Modify: `tests/engine/EventSystem.test.ts`

**Step 1: 写测试**
- `VectorTileLayer` 能通过 `resolveRecovery` 获取 `tile-parse` 恢复配置
- 解析临时失败能按 retry 成功恢复
- 重试耗尽后可按配置 fallback 空结果，并产生结构化错误上报
- 引擎级规则命中时，策略指标（query/hit/rule-hit）有增量

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts tests/engine/EventSystem.test.ts`
Expected: PASS

### Task 2: 实现 Vector 恢复接缝

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/layers/VectorTileLayer.ts`

**Step 1: 写最小实现**
- 扩展 `LayerRecoveryOverrides` 增加 Vector parse 恢复配置
- `VectorTileLayer` 增加解析重试与 fallback 处理
- 结构化错误上报补充 `attempts/fallbackUsed`
- 引擎规则匹配支持 vector 配置字段透传

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts tests/engine/EventSystem.test.ts`
Expected: PASS

### Task 3: 文档与门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 补充 Vector 恢复行为与策略示例
- checkpoint 更新到 `v1.0` 收口并给出下一步

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
