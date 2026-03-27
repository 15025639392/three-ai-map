# Three.js 地球引擎 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从 0 搭建一个基于 `three.js` 的轻量地球引擎首期版本，具备球体渲染、经纬度定位、基础影像、点标记与拾取能力。

**Architecture:** 采用分层式内核结构，将渲染运行时、地理计算、地球宿主、图层系统与对外引擎装配分离。首期坚持窄接口和最小能力集，优先建立稳定数据流与生命周期，再扩展更多地图能力。

**Tech Stack:** `TypeScript`, `three`, `Vite`, 原生浏览器 API

---

### Task 1: 初始化工程骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`

**Step 1: 写失败测试**

手工验收入口缺失，当前无法启动任何示例页面。

**Step 2: 运行测试并确认失败**

Run: `npm run dev`
Expected: FAIL with missing `package.json` or missing script

**Step 3: 写最小实现**

- 初始化 `Vite + TypeScript` 工程
- 配置单页面入口与基本样式
- 在 `src/main.ts` 中挂载最小引导代码

**Step 4: 运行测试并确认通过**

Run: `npm run dev`
Expected: dev server starts and serves a blank scaffold page

**Step 5: 提交**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.ts src/styles.css
git commit -m "feat: 初始化地球引擎工程骨架"
```

### Task 2: 建立 core 运行时

**Files:**
- Create: `src/core/RendererSystem.ts`
- Create: `src/core/SceneSystem.ts`
- Create: `src/core/FrameLoop.ts`
- Create: `src/core/CameraController.ts`
- Modify: `src/main.ts`

**Step 1: 写失败测试**

定义最小人工验收标准：
- 页面打开后没有 three.js 场景
- 窗口尺寸变化时画布不能同步更新

**Step 2: 运行测试并确认失败**

Run: `npm run dev`
Expected: page renders but no interactive 3D scene is visible

**Step 3: 写最小实现**

- 创建渲染器、场景与相机
- 建立帧循环与 resize 同步
- 提供基础拖拽旋转、滚轮缩放控制

**Step 4: 运行测试并确认通过**

Run: `npm run dev`
Expected: page shows an interactive 3D scene and responds to resize

**Step 5: 提交**

```bash
git add src/core src/main.ts
git commit -m "feat: 建立渲染运行时与相机控制"
```

### Task 3: 建立 geo 坐标基础

**Files:**
- Create: `src/geo/cartographic.ts`
- Create: `src/geo/ellipsoid.ts`
- Create: `src/geo/projection.ts`
- Create: `src/geo/raycast.ts`
- Create: `tests/geo/projection.test.ts`
- Create: `tests/geo/raycast.test.ts`

**Step 1: 写失败测试**

```ts
import { cartographicToCartesian } from "../../src/geo/projection";

it("converts lon lat to globe position", () => {
  const point = cartographicToCartesian({ lon: 0, lat: 0, height: 0 }, 1);
  expect(point.x).toBeCloseTo(1);
  expect(point.y).toBeCloseTo(0);
  expect(point.z).toBeCloseTo(0);
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/geo/projection.test.ts`
Expected: FAIL with module not found or function not implemented

**Step 3: 写最小实现**

- 建立经纬度对象与椭球常量
- 实现经纬度转球面坐标
- 实现球体射线求交与经纬度反解

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/geo/projection.test.ts tests/geo/raycast.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/geo tests/geo
git commit -m "feat: 添加地理坐标转换与球体求交能力"
```

### Task 4: 建立 globe 宿主

**Files:**
- Create: `src/globe/GlobeMaterial.ts`
- Create: `src/globe/GlobeMesh.ts`
- Modify: `src/main.ts`

**Step 1: 写失败测试**

手工验收标准：
- 当前场景中没有可见球体
- 相机交互无法验证地球宿主存在

**Step 2: 运行测试并确认失败**

Run: `npm run dev`
Expected: interactive scene exists but no globe mesh is visible

**Step 3: 写最小实现**

- 创建球体几何与基础材质
- 将球体作为宿主节点接入场景
- 支持接收单张基础纹理

**Step 4: 运行测试并确认通过**

Run: `npm run dev`
Expected: globe mesh is visible and camera can orbit around it

**Step 5: 提交**

```bash
git add src/globe src/main.ts
git commit -m "feat: 添加地球宿主球体"
```

### Task 5: 建立 engine 装配层

**Files:**
- Create: `src/engine/EngineOptions.ts`
- Create: `src/engine/GlobeEngine.ts`
- Modify: `src/main.ts`

**Step 1: 写失败测试**

```ts
import { GlobeEngine } from "../../src/engine/GlobeEngine";

it("creates and destroys engine cleanly", () => {
  const container = document.createElement("div");
  const engine = new GlobeEngine({ container });
  expect(engine).toBeDefined();
  engine.destroy();
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/engine/GlobeEngine.test.ts`
Expected: FAIL with class not found

**Step 3: 写最小实现**

- 用 `GlobeEngine` 装配 core、geo 与 globe
- 暴露 `setView`、`resize`、`render`、`destroy`
- 管理统一生命周期

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/engine/GlobeEngine.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/engine tests/engine
git commit -m "feat: 装配地球引擎生命周期"
```

### Task 6: 建立图层抽象与影像层

**Files:**
- Create: `src/layers/Layer.ts`
- Create: `src/layers/LayerManager.ts`
- Create: `src/layers/ImageryLayer.ts`
- Create: `tests/layers/LayerManager.test.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/globe/GlobeMesh.ts`

**Step 1: 写失败测试**

```ts
it("adds and removes layers through manager", () => {
  // expect lifecycle hooks to run in order
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/LayerManager.test.ts`
Expected: FAIL with missing layer manager

**Step 3: 写最小实现**

- 定义统一图层生命周期接口
- 建立图层管理器
- 实现单张纹理影像层并绑定到球体材质

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/LayerManager.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers src/engine/GlobeEngine.ts src/globe/GlobeMesh.ts tests/layers
git commit -m "feat: 添加图层管理与基础影像层"
```

### Task 7: 建立标记层与拾取能力

**Files:**
- Create: `src/layers/MarkerLayer.ts`
- Create: `tests/layers/MarkerLayer.test.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/geo/raycast.ts`

**Step 1: 写失败测试**

```ts
it("returns marker hit result when clicking a marker", () => {
  // expect pick result to include marker metadata
});
```

**Step 2: 运行测试并确认失败**

Run: `npm run test:run -- tests/layers/MarkerLayer.test.ts`
Expected: FAIL with marker layer or pick support missing

**Step 3: 写最小实现**

- 基于经纬度放置标记对象
- 建立标记拾取结果结构
- 在 `engine.pick()` 中串联球体与图层拾取

**Step 4: 运行测试并确认通过**

Run: `npm run test:run -- tests/layers/MarkerLayer.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/layers/MarkerLayer.ts src/engine/GlobeEngine.ts src/geo/raycast.ts tests/layers/MarkerLayer.test.ts
git commit -m "feat: 添加标记层与拾取能力"
```

### Task 8: 提供最小示例与验收

**Files:**
- Create: `examples/basic-globe.ts`
- Modify: `src/main.ts`
- Create: `docs/acceptance/threejs-globe-engine.md`

**Step 1: 写失败测试**

手工验收清单缺失，无法稳定复测首期能力。

**Step 2: 运行测试并确认失败**

Run: `npm run dev`
Expected: engine works partially but no dedicated demo or acceptance document exists

**Step 3: 写最小实现**

- 提供最小示例页面
- 在示例中加载影像、添加标记并输出拾取结果
- 写首期人工验收文档

**Step 4: 运行测试并确认通过**

Run: `npm run dev`
Expected: demo verifies all first-phase acceptance items manually

**Step 5: 提交**

```bash
git add examples/basic-globe.ts src/main.ts docs/acceptance/threejs-globe-engine.md
git commit -m "feat: 补齐首期示例与验收文档"
```

### Task 9: 收尾与质量校验

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-27-threejs-globe-engine-design.md`

**Step 1: 写失败测试**

当前缺少完整的使用说明与计划回链，后续接手成本高。

**Step 2: 运行测试并确认失败**

Run: `npm run test:run`
Expected: may pass, but documentation and onboarding are incomplete

**Step 3: 写最小实现**

- 更新 README 的启动方式和项目结构
- 回填设计文档中的实现状态与链接

**Step 4: 运行测试并确认通过**

Run: `npm run test:run`
Expected: PASS and docs reflect actual implementation status

**Step 5: 提交**

```bash
git add README.md docs/plans/2026-03-27-threejs-globe-engine-design.md
git commit -m "docs: 完善地球引擎首期文档"
```
