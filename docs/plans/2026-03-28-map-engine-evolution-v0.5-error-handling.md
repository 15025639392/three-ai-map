# Three-Map v0.5 统一错误处理实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 docs 中“统一错误处理机制”的首个可落地版本接进当前引擎：图层异步失败不再只散落在控制台，而是通过 `LayerContext.reportError` 统一汇入 `GlobeEngine` 事件系统。

**Architecture:** 保持当前 `GlobeEngine -> LayerManager -> Layer` 生命周期不变，只在 `LayerContext` 增加错误上报接缝。`SurfaceTileLayer` 与 `ElevationLayer` 负责把异步失败包装为结构化 payload，`GlobeEngine` 负责转发 `error` 事件并保留性能指标入口。

**Tech Stack:** `TypeScript`, `three`, `vitest`

---

### Task 1: 写错误事件回归测试

**Files:**
- Modify: `tests/engine/EventSystem.test.ts`
- Modify: `tests/layers/SurfaceTileLayer.test.ts`
- Modify: `tests/layers/ElevationLayer.test.ts`

**Step 1: 写失败测试**
- `GlobeEngine` 能转发图层通过 `reportError` 上报的错误事件
- `SurfaceTileLayer` 的非 abort 失败会触发结构化错误上报
- `ElevationLayer` 的 tile load 失败会触发结构化错误上报

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts tests/layers/SurfaceTileLayer.test.ts tests/layers/ElevationLayer.test.ts`
Expected: FAIL because engine 还没有 `error` 事件，图层也没有统一错误上报

### Task 2: 打通引擎级错误上报

**Files:**
- Modify: `src/layers/Layer.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/index.ts`

**Step 1: 写最小实现**
- 在 `LayerContext` 增加 `reportError`
- `GlobeEngineEvents` 增加 `error`
- `GlobeEngine` 把图层错误转发到事件系统
- 对外导出错误事件相关类型

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/engine/EventSystem.test.ts`
Expected: PASS

### Task 3: 接入 Surface / Elevation 错误边界

**Files:**
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `src/layers/ElevationLayer.ts`

**Step 1: 写最小实现**
- `SurfaceTileLayer` 区分 abort 与真实失败，避免取消请求误报
- `SurfaceTileLayer` 在非 abort 异常时调用 `reportError`
- `ElevationLayer` 在 tile load / sampler build 失败时调用 `reportError`
- 保留原有 `ready()` / 生命周期行为，不扩大改动面

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts tests/layers/ElevationLayer.test.ts`
Expected: PASS

### Task 4: 文档与全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 补充 `engine.on("error", ...)` 用法与导出类型
- checkpoint 记录当前阶段已推进到统一错误上报

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
