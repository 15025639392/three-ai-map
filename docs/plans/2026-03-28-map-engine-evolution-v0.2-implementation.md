# Three-Map v0.2 首阶段演进实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不破坏现有 demo 与公开 API 的前提下，完成首个正式里程碑的核心稳固：补齐瓦片调度取消链路、落地 `VectorTileLayer` 的 MVT MVP，并把浏览器 smoke / 全量校验收敛成统一质量入口。

**Architecture:** 保持当前 `layers -> tiles -> loaders` 的分层结构不变，只在现有接缝补充 `AbortSignal`、取消/优先级调度和真实 MVT 解码能力。SurfaceTile 的渲染正确性继续以 deterministic demo + browser smoke 为准，VectorTile MVP 仅负责解析与样式映射，不引入新的大规模渲染管线重构。

**Tech Stack:** `TypeScript`, `three`, `vitest`, `Rspack`, `@mapbox/vector-tile`, `pbf`

---

### Task 1: 补齐 TileScheduler 取消与优先级

**Files:**
- Modify: `src/tiles/TileScheduler.ts`
- Modify: `tests/tiles/TileScheduler.test.ts`

**Step 1: 写失败测试**

```ts
it("cancels a queued tile by key", async () => {
  const deferred = createDeferred<string>();
  const scheduler = new TileScheduler<string, { id: string }>({
    concurrency: 1,
    loadTile: () => deferred.promise
  });

  const first = scheduler.request("0/0/0", { id: "first" });
  const second = scheduler.request("0/0/1", { id: "second" });

  scheduler.cancel("0/0/1");
  deferred.resolve("ok");

  await expect(first).resolves.toBe("ok");
  await expect(second).rejects.toThrow("0/0/1");
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/tiles/TileScheduler.test.ts`
Expected: FAIL with `scheduler.cancel is not a function` / priority assertions failing

**Step 3: 写最小实现**

```ts
request(key, payload, { priority })
cancel(key)
clear()
```

- 为每个请求维护 `AbortController`
- 支持 queued / active 两种取消路径
- 在队列中按 priority 排序，默认 `0`
- `clear()` 取消 queued 与 active，但不破坏 `activeCount` 计数

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/tiles/TileScheduler.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/tiles/TileScheduler.ts tests/tiles/TileScheduler.test.ts
git commit -m "fix: 补齐瓦片调度优先级与取消链路"
```

---

### Task 2: 让 SurfaceTileLayer 真正取消过期请求

**Files:**
- Modify: `src/layers/SurfaceTileLayer.ts`
- Modify: `src/tiles/tileLoader.ts`
- Modify: `tests/layers/SurfaceTileLayer.test.ts`

**Step 1: 写失败测试**

```ts
it("cancels stale tile requests when selection changes", async () => {
  const loader = vi.fn((_coordinate, signal?: AbortSignal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));

  // 初始选中 A，随后切到 B
  // 断言 A 对应请求收到 abort
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts`
Expected: FAIL because stale requests are not aborted

**Step 3: 写最小实现**

- `loadImageryTile` / `loadElevationTile` 签名扩展为可接收 `AbortSignal`
- 默认图片 / CORS loader 支持 abort
- `SurfaceTileLayer.removeTile()`、`clearActiveTiles()`、`onRemove()`、`dispose()` 中显式取消对应 key
- 过期取消错误不再作为真实失败噪音输出

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/SurfaceTileLayer.ts src/tiles/tileLoader.ts tests/layers/SurfaceTileLayer.test.ts
git commit -m "fix: 取消 SurfaceTile 过期瓦片请求"
```

---

### Task 3: 实现 VectorTileLayer 的 MVT MVP

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/layers/VectorTileLayer.ts`
- Modify: `tests/layers/VectorTileLayer.test.ts`

**Step 1: 写失败测试**

```ts
it("parses point line polygon features from a real mvt payload", async () => {
  const payload = createMvtFixture();
  const features = await layer.parseTile(payload, 1, 2, 3);

  expect(features.map((feature) => feature.type).sort()).toEqual([
    "line",
    "point",
    "polygon"
  ]);
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: FAIL because `parseTile()` returns `[]`

**Step 3: 写最小实现**

- 引入 `pbf` + `@mapbox/vector-tile`
- 解析真实 MVT 字节并输出 point / line / polygon
- 按 layerFilter 过滤
- 把瓦片坐标转换为经纬度语义坐标，保留原始 properties
- `applyStyle()` 合并 layer style 与 feature properties

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/VectorTileLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add package.json package-lock.json src/layers/VectorTileLayer.ts tests/layers/VectorTileLayer.test.ts
git commit -m "feat: 实现 VectorTileLayer 的 MVT MVP"
```

---

### Task 4: 收敛质量入口与回归 demo

**Files:**
- Modify: `package.json`
- Modify: `src/main.ts`
- Modify: `tests/main.test.ts`
- Modify: `scripts/browser-smoke-surface-tile-regression.mjs`
- Modify: `README.md`

**Step 1: 写失败测试**

```ts
it("renders the resize regression demo card", () => {
  main.render();
  expect(document.body.textContent).toContain("Surface Tile Resize Regression");
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/main.test.ts`
Expected: FAIL because main index misses the resize regression demo

**Step 3: 写最小实现**

- 将 resize regression demo 纳入 demo 列表
- 增加统一质量命令，串起 `typecheck` / `test:run` / browser smoke
- Chrome 查找逻辑支持 `CHROME_BIN`、macOS、Linux 常见二进制
- README 补充首阶段质量门禁说明

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/main.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add package.json src/main.ts tests/main.test.ts scripts/browser-smoke-surface-tile-regression.mjs README.md
git commit -m "chore: 收敛地图引擎首阶段质量门禁"
```

---

### Task 5: 执行首阶段验证

**Files:**
- Reference: `docs/plans/2026-03-28-map-engine-evolution-requirement.md`
- Reference: `docs/plans/2026-03-28-map-engine-evolution-scorecard.md`

**Step 1: 运行定向测试**

Run: `npm run test:run -- tests/tiles/TileScheduler.test.ts tests/layers/SurfaceTileLayer.test.ts tests/layers/VectorTileLayer.test.ts tests/main.test.ts`
Expected: PASS

**Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

**Step 3: 运行全量测试**

Run: `npm run test:run`
Expected: PASS

**Step 4: 运行浏览器 smoke**

Run: `npm run test:browser:surface-tiles`
Expected: PASS with two screenshots and two DOM snapshots under `test-results/`

**Step 5: 对照需求文档逐项收口**

- T2：已具备取消 / Abort / priority
- T4：`VectorTileLayer` 不再是空实现
- T6：质量入口、demo 与 smoke 已串联
