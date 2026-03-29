# Three-Map v0.4 VectorTile 渲染实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `VectorTileLayer` 从 MVT 解析 MVP 推进到可渲染 MVP：点、线、面三类要素能转换为引擎几何并作为真实 `Layer` 接入 `GlobeEngine`。

**Architecture:** 继续复用现有 `Layer` 生命周期与 overlay 几何构建方式，不新建独立渲染管线。`VectorTileLayer` 负责保存 parsed features / tile buckets，并在 `onAdd` / `setTileData` 时把要素转换为 `three` 对象挂入 scene。

**Tech Stack:** `TypeScript`, `three`, `vitest`, `@mapbox/vector-tile`, `pbf`

---

### Task 1: 写渲染接入失败测试

**Files:**
- Modify: `tests/layers/VectorTileLayer.test.ts`

**Step 1: 写失败测试**
- `setTileData()` 后，`onAdd()` 能在 scene 中创建 point / line / polygon 对象
- `layerFilter` 生效时，只渲染命中的 layer
- `onRemove()` / `dispose()` 后正确释放 scene children

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: FAIL because `VectorTileLayer` 还没有渲染生命周期

### Task 2: 实现 VectorTileLayer 渲染 MVP

**Files:**
- Modify: `src/layers/VectorTileLayer.ts`

**Step 1: 写最小实现**
- 新增内部 `Group`
- 提供 `setTileData(tileData, x, y, z)` 与 `setFeatures(features, tileKey?)`
- 点转 `Mesh<SphereGeometry>`
- 线转 `Line`
- 面转 `Mesh<BufferGeometry>`
- `onAdd` / `onRemove` / `dispose` 负责 scene 生命周期与资源释放

**Step 2: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: PASS

### Task 3: 文档与验证

**Files:**
- Modify: `README.md`

**Step 1: 更新说明**
- 把 `VectorTileLayer` 描述从“解析 MVP”更新成“渲染 MVP”

**Step 2: 运行全量验证**

Run: `npm run test:map-engine`
Expected: PASS
