# 01 Cesium Surface Architecture

## 1. 分层编排（核心）

Cesium 的地球渲染不是“一个 GlobeMesh”，而是分层系统：

- `Scene`：帧级调度与 pass 编排
- `Globe`：地球实体与参数入口（SSE、cache、光照等）
- `QuadtreePrimitive`：LOD 选择、加载队列、渲染列表
- `GlobeSurfaceTileProvider`：terrain + imagery 的具体 tile 生产与绘制

关键源码：

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`

## 2. 为什么这是“正规引擎”结构

- `QuadtreePrimitive` 只依赖 `QuadtreeTileProvider` 抽象，不耦合具体数据源。
- Surface 子系统统一管理地形和影像，不让业务 Layer 直接操作底层网格。
- 渲染是 pass 化：environment/globe/terrain classification/3d tiles/translucent 等分阶段执行。

## 3. 可直接迁移的规则

1. `SurfaceSystem` 必须是内核子系统，不要把 `GlobeMesh` 暴露给业务层。
2. LOD 选择器只依赖 provider 接口，禁止直接读纹理或材质状态。
3. 一切 Layer（矢量、标注、模型）走 overlay pass，和 surface 解耦。

