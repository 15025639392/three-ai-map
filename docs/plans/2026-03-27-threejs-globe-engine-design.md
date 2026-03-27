# Three.js 地球引擎设计

## 1. 目标

基于 `three.js` 从 0 构建一个轻量地球引擎首期版本，在尽量少依赖外部库的前提下，提供可交互地球、经纬度坐标能力、基础影像承载、点标记与拾取能力，并为后续扩展到更多地图图层与数据能力预留清晰结构。

## 2. 约束

- 核心渲染依赖限定为 `three`
- 尽量不引入 UI 框架、状态库、GIS 重型依赖
- 首期目标是“地图能力优先的收敛版方案”，不是完整 GIS 平台
- 仓库当前为空目录，需从基础工程开始搭建

## 3. 首期范围

### In Scope

- 地球球体渲染
- WGS84 经纬度到球面坐标转换
- 相机旋转、缩放、视角定位
- 单层基础影像贴图或极简瓦片贴图
- 点标记图层
- 球体与标记拾取
- 图层增删与基础生命周期
- 最小可运行示例

### Out of Scope

- 地形与高程
- 矢量瓦片
- 后处理体系
- 大气散射高阶效果
- 多级缓存与瓦片调度系统
- 时间轴、动画编排、插件市场式扩展

## 4. 架构选择

已确认采用 `B` 方案，即“分层式内核”。

### 分层

- `core`
  - 负责渲染器、场景、相机、帧循环、尺寸同步
- `geo`
  - 负责坐标转换、球面求交、基础地理对象
- `globe`
  - 负责地球宿主 mesh 与材质
- `layers`
  - 负责图层抽象、图层管理、影像层与标记层
- `engine`
  - 负责系统装配、生命周期管理与对外 API

### 设计取舍

- 不采用单体式核心类，避免后续功能增长导致职责塌陷
- 不首期引入插件化框架，避免过早抽象
- 地球宿主不视为普通业务图层，保持坐标基底与业务图层分离

## 5. 目录草案

```text
src/
  core/
    RendererSystem.ts
    CameraController.ts
    SceneSystem.ts
    FrameLoop.ts
  geo/
    ellipsoid.ts
    cartographic.ts
    projection.ts
    raycast.ts
  globe/
    GlobeMesh.ts
    GlobeMaterial.ts
  layers/
    Layer.ts
    ImageryLayer.ts
    MarkerLayer.ts
    LayerManager.ts
  engine/
    GlobeEngine.ts
    EngineOptions.ts
  utils/
    EventEmitter.ts
    dispose.ts
examples/
  basic-globe.ts
```

## 6. 数据流

1. `GlobeEngine` 初始化 `RendererSystem / SceneSystem / CameraController / GlobeMesh / LayerManager`
2. `FrameLoop` 在每帧驱动引擎更新
3. `CameraController` 更新相机状态
4. `LayerManager` 调度各图层更新
5. `RendererSystem` 执行渲染
6. 用户交互通过 `engine.pick()` 先命中球体，再分发到图层拾取逻辑

该数据流保持单主链路，避免图层反向控制底层渲染系统。

## 7. 对外 API 草案

```ts
const engine = new GlobeEngine({
  container,
  radius,
  background,
  camera,
});

engine.setView({
  lon,
  lat,
  altitude,
  duration,
});

engine.addLayer(layer);
engine.removeLayer(layer.id);

engine.addMarker({
  id,
  lon,
  lat,
  altitude,
  style,
});

engine.pick(screenX, screenY);

engine.resize();
engine.render();
engine.destroy();
```

原则：

- 首期 API 保持窄接口，只暴露高频能力
- 可提供底层 `scene/camera/renderer` 的只读访问，但不鼓励直接外部写入
- 图层能力通过统一抽象扩展，不在 `GlobeEngine` 上堆叠过多业务接口

## 8. 里程碑

### M1: 内核跑通

- 建立渲染器、场景、相机与帧循环
- 建立地球球体与基础交互

### M2: 地理能力跑通

- 完成经纬度转换
- 完成点击球体返回经纬度
- 完成基础视角定位

### M3: 图层能力跑通

- 建立 `Layer` 抽象与 `LayerManager`
- 接入 `ImageryLayer` 与 `MarkerLayer`
- 支持基础拾取

### M4: 示例与验收

- 提供最小 demo
- 覆盖人工验收链路

## 9. 验收标准

- 页面能初始化一个可交互地球
- 支持拖拽旋转与滚轮缩放
- 支持按经纬度定位视角
- 支持一层基础影像贴图
- 支持添加多个点标记
- 点击地球能返回经纬度
- 点击标记能返回标记对象
- 图层可增删且能正确释放 three.js 资源
- 提供最小运行示例

## 10. 风险

- 若首期把贴图能力直接扩展成完整瓦片系统，复杂度会明显失控
- 若相机控制和坐标转换接口定义不稳，后续覆盖物能力会返工
- 若对外暴露过多底层对象，生命周期与状态一致性会难以维护

## 11. 演进路线

### 第二阶段

- 多影像图层叠加
- 更完整的覆盖物体系（线、面、标签）
- 更稳定的事件系统与命中返回结构

### 第三阶段

- 瓦片调度与缓存
- 地形与高程
- 更高级视觉效果与性能优化
