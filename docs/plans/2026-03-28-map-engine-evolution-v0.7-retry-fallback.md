# Three-Map v0.7 SurfaceTile 重试与降级实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 `v0.6` 的错误分类语义，为 `SurfaceTileLayer` 影像链路增加可配置重试与降级（fallback）能力，降低临时网络波动导致的整瓦片缺失。

**Architecture:** 不改动 `TileScheduler` 的并发与取消语义，在 `SurfaceTileLayer` 内部包装 imagery 请求恢复逻辑：先按配置重试，重试耗尽后可回退到纯色占位纹理；事件系统继续复用 `LayerContext.reportError`，并补充 `attempts/fallbackUsed` 元数据。

**Tech Stack:** `TypeScript`, `vitest`

---

### Task 1: 写失败测试

**Files:**
- Modify: `tests/layers/SurfaceTileLayer.test.ts`

**Step 1: 写失败测试**
- 临时失败可在重试后恢复成功（不触发错误上报）
- 永久失败在重试耗尽后回退到 fallback 纹理并触发结构化错误上报

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts`
Expected: FAIL because `SurfaceTileLayer` 还没有重试和降级逻辑

### Task 2: 实现重试与降级

**Files:**
- Modify: `src/layers/SurfaceTileLayer.ts`

**Step 1: 写最小实现**
- 增加 `imageryRetryAttempts`、`imageryRetryDelayMs`、`imageryFallbackColor`
- imagery 加载支持重试循环与延迟
- 重试耗尽后（配置了 fallback）回退到纯色 `canvas` 纹理
- 错误上报补充 `attempts` 与 `fallbackUsed`

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts`
Expected: PASS

### Task 3: 文档与门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 增加重试与降级配置示例
- checkpoint 记录 v0.7 收口状态与下一步

**Step 2: 跑全量门禁**

Run: `npm run test:map-engine`
Expected: PASS
