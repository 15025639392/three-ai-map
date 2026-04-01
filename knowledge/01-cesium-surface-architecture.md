# 01 Cesium Surface Architecture

## 1. 目标与边界

本章只回答一个问题：
如何按 Cesium 的正规架构组织「地球曲面渲染（surface）」系统，避免 `GlobeMesh`/layer 互相穿刺、LOD 混乱、以及影像地形耦合失控。

本章不展开具体 SSE 公式与细化阈值推导（见 `02-quadtree-sse-selection.md`），而聚焦系统分层与职责契约。

---

## 2. Cesium 的核心分层

Cesium 的 surface 不是单一 mesh，而是四层协作：

1. `Scene`
2. `Globe`
3. `QuadtreePrimitive`
4. `GlobeSurfaceTileProvider`

对应职责如下。

### 2.1 `Scene`（帧图与 pass 调度）

- 管每帧更新入口、渲染 pass 顺序、命令队列提交。
- 不直接做地形/影像拼装。
- 只调用下层“你该更新并产生命令”。

### 2.2 `Globe`（地球参数入口）

- 持有 surface 相关全局参数（SSE、最大/最小级别、光照、地下剔除等）。
- 持有 terrain provider、imagery layer collection。
- 把参数传给 `QuadtreePrimitive` 与 `GlobeSurfaceTileProvider`。

### 2.3 `QuadtreePrimitive`（LOD 选择与生命周期驱动）

- 负责选四叉树节点（select）、决定 refine 或 render。
- 维护可见节点集、加载队列优先级、祖先回退、子就绪替换时机。
- 不关心 tile 最终怎么画（几何细节/材质细节不在此层）。

### 2.4 `GlobeSurfaceTileProvider`（tile 生产与绘制）

- 给定 quadtree 节点，生产可渲染 surface tile：
- 地形几何准备（mesh 顶点、法线、裙边）
- 影像层链路拼装（多层 imagery 纹理链）
- DrawCommand 生成与更新
- 在“父保留 + 子就绪原子替换”中提供可判定状态

---

## 3. 帧内运行流水线（标准顺序）

每帧的 surface 主流程可以抽象为：

1. `Scene.update`
2. `Globe.update`
3. `QuadtreePrimitive.selectTilesForRendering`
4. `GlobeSurfaceTileProvider.beginUpdate / endUpdate`
5. `Scene.executeCommands`（按 pass 绘制）

关键点：

- LOD 选择与渲染准备分离。
- select 阶段只做“选谁”；provider 阶段做“怎么画”。
- 没准备好时永远用可用祖先兜底，不让屏幕出现洞。

---

## 4. 正规引擎的三条硬约束

### 4.1 约束 A：Surface 子系统统一管理 terrain + imagery

- terrain/imagery 都是 provider，不是业务 layer 私有逻辑。
- 业务 layer（矢量、标注、3D 对象）不允许直接操作 surface mesh。

### 4.2 约束 B：LOD 选择器只依赖抽象状态

- `QuadtreePrimitive` 只看：
- 可见性
- SSE/误差
- 子可细化条件
- provider readiness
- 禁止直接访问具体 shader/texture/material 实现。

### 4.3 约束 C：渲染必须 pass 化

推荐顺序：

1. `environment`（天空/大气/星空）
2. `surface`（terrain geometry + imagery color）
3. `overlay`（矢量、标注、模型、特效）
4. `translucent / post`

---

## 5. Cesium 处理“闪烁/穿刺/黑块”的架构机制

### 5.1 父级保留 + 子级就绪后原子替换

- 子节点资源未 ready 时，父节点继续渲染。
- 子完整 ready 后，父在同帧被替换。
- 避免父/子/占位 mesh 交替可见导致闪烁。

### 5.2 active host tile 内影像链合成

- 影像不是“独立父影像 mesh”满屏漂浮。
- 在当前 active host tile 内做祖先影像链采样与合成。
- 保证影像与地形几何同宿主，避免遮挡/深度混乱。

### 5.3 默认椭球地形兜底

- 没有 terrain provider 时，surface 仍可渲染（ellipsoid host）。
- 影像不会因为“缺 terrain layer”而空白。

---

## 6. 数据抽象契约（可直接落地）

实现时建议固定三类接口。

### 6.1 `TerrainProvider`

- 输入：`tileID(z/x/y)`、取消信号
- 输出：高度数据或已解码 mesh 数据
- 状态：`unloaded/loading/ready/failed`

### 6.2 `ImageryProvider`

- 输入：`tileID`、取消信号
- 输出：纹理源（image/bitmap/canvas）
- 状态：`unloaded/loading/ready/failed`

### 6.3 `SurfaceTileProvider`

- 输入：quadtree tile + providers + frame state
- 输出：可渲染 tile record（geometry + imagery chain + draw metadata）
- 责任：告诉 quadtree “此 tile 是否可安全替换显示”

---

## 7. 与当前 three-map 的一一映射

建议映射关系如下：

- `Scene` -> `GlobeEngine` + `SceneSystem`
- `Globe` -> `SurfaceSystem`（surface 参数入口）
- `QuadtreePrimitive` -> `SurfaceTilePlanner` + surface 生命周期控制
- `GlobeSurfaceTileProvider` -> `TerrainTileLayer` + `RasterLayer` 在 `SurfaceSystem` 下的统一编排

落地约束：

1. `GlobeEngine` 只做编排，不持有 surface 细节状态机。
2. `SurfaceSystem` 持有 interaction phase、plan cache、idle reset、coverage state。
3. layer 只能通过 context 抽象能力访问 surface，不反射 engine 私有字段。

---

## 8. 代码组织建议（删旧后的干净结构）

建议目录职责：

- `src/engine/*`：帧调度、相机、渲染器、事件
- `src/surface/*`：surface host、plan、provider 编排、生命周期
- `src/tiles/*`：四叉树节点、SSE、可见性、请求优先级
- `src/sources/*`：terrain/imagery source 与调度缓存
- `src/layers/*`：overlay 业务层；surface layer 仅保留 provider 适配壳

删除原则：

- 删除旧别名 API，不做兼容桥接。
- 删除未接线草稿实现（尤其 instancing 草稿/旧 projection 工具）。
- 删除任何依赖私有字段反射才能工作的脚本路径。

---

## 9. 评审清单（架构是否“像 Cesium”）

满足以下项，说明已进入正规架构区间：

1. 无 terrain 时影像仍可显示（ellipsoid host）。
2. imagery LOD 不被 terrain maxZoom 硬钳死。
3. 父保留/子原子替换可观察，且无交替闪烁。
4. overlay layer 不接触 `GlobeMesh`/surface 内部 mesh。
5. quadtree 选择器不依赖材质/纹理实现细节。
6. surface 回归测试可稳定自动化（非手工观察）。

---

## 10. 对应 Cesium 参考源码

建议重点阅读：

- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Scene/QuadtreePrimitive.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
- `packages/engine/Source/Scene/TileSelectionResult.js`

阅读方法：

1. 先看 `Scene` 如何驱动 `Globe.update`。
2. 再看 `QuadtreePrimitive` 选择流程与 kick/ancestor fallback。
3. 最后看 `GlobeSurfaceTileProvider` 如何把 terrain/imagery 组装成命令。

这三步看通后，再回到本项目实现，会非常清晰地知道哪些属于“必须保留的核心”，哪些是可以删掉的历史包袱。
