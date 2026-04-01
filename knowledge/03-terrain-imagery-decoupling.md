# 03 Terrain Imagery Decoupling

## 1. 目标与边界

本章解决三个高频架构问题：

1. 为什么影像与地形必须解耦为独立 provider
2. 为什么“无 terrain layer 就空白”是错误实现
3. 为什么 imagery LOD 不能被 terrain maxZoom 直接钳死

本章聚焦数据表达与组合关系，不展开请求队列细节（见 `04-request-scheduling-cache-lifecycle.md`）。

---

## 2. 正规模型：双 provider + surface 统一组合

Cesium 的核心不是“terrain layer + raster layer 各画各的”，而是：

- 地形：`TerrainProvider`
- 影像：`ImageryProvider` + `ImageryLayer`
- 组合点：`GlobeSurfaceTileProvider`

关键意义：

- 地形决定几何承载面（geometry host）
- 影像决定颜色与纹理细节（color detail）
- 两者在 surface tile 内聚合，不在业务 layer 层硬绑

关键源码参考：

- `packages/engine/Source/Core/TerrainProvider.js`
- `packages/engine/Source/Scene/ImageryProvider.js`
- `packages/engine/Source/Scene/ImageryLayer.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`

---

## 3. 默认椭球承载（Ellipsoid Host）是底线

## 3.1 正规行为

没有真实 DEM 时，Cesium 仍有 `EllipsoidTerrainProvider`：

- surface 仍有几何宿主
- imagery 仍能贴图显示
- 系统不会进入“必须先加 terrain layer 才能看见影像”的错误状态

## 3.2 工程结论

必须把“默认椭球地形”做成内核默认值，而非业务层可选特性。

关键源码参考：

- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Core/EllipsoidTerrainProvider.js`

---

## 4. 独立 LOD：几何细化与纹理细化必须分开

## 4.1 错误模型

错误做法是：

- 使用 terrain target zoom 直接作为 imagery 请求级别上限

结果：

- 影像上限被 terrain maxZoom 锁死
- 即使 source 支持更高 zoom，也永远请求不到
- 视觉表现是“几何不细时影像也糊”

## 4.2 正规模型

应拆分为两条 LOD：

1. `terrainLOD`：由几何误差/SSE 驱动
2. `imageryLOD`：由屏幕纹理误差（texel spacing）驱动

两者关系：

- imagery 可高于 terrain 当前几何级别
- 高级影像可以采样并合成到较粗几何 host 上
- 渲染结果仍稳定，因为宿主一致（同一个 host tile）

关键源码参考：

- `packages/engine/Source/Scene/ImageryLayer.js`
- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/Imagery.js`

---

## 5. Cesium 的 host 内影像链机制

## 5.1 不采用独立父影像 mesh

正规的实现不会单独画“父级影像大贴片 mesh”来补洞，因为会引发：

- 深度顺序不稳定
- 与 terrain mesh 遮挡错配
- 父子替换瞬间闪烁

## 5.2 采用 active host tile 内祖先链合成

每个 active host tile 内部维护 imagery chain：

- 目标级别影像未就绪时，回退祖先影像
- 目标级别就绪后在同 host 内替换采样源
- 不改变几何宿主，不引入额外覆盖 mesh

这就是“画面一旦有影像覆盖，就不应再看到裸 GlobeMesh/占位块交替”的根本机制。

---

## 6. 数据对象职责（建议最小契约）

## 6.1 `TerrainTileRecord`

- `tileID`
- geometry 状态（unloaded/loading/ready/failed）
- 几何数据/mesh 引用
- 可用于渲染的 ready 标记

## 6.2 `TileImageryRecord`

- host tile 关联
- imagery target level
- 当前可用祖先 imagery 引用
- 就绪状态与引用计数

## 6.3 `SurfaceHostTile`

- 统一持有 geometry + imagery chain
- 统一给渲染器提交 draw 所需绑定
- 统一执行父保留/子替换判断

---

## 7. 组合阶段的状态转移规则

建议状态机（简化）：

1. `HOST_GEOMETRY_READY + IMAGERY_ANCESTOR_READY` -> 可渲染（退化纹理）
2. `HOST_GEOMETRY_READY + IMAGERY_TARGET_READY` -> 可渲染（目标纹理）
3. `HOST_GEOMETRY_NOT_READY` -> 祖先 host 兜底，不直接空洞

关键规则：

- 永远优先保证“有东西可画”
- 目标质量通过异步收敛，不通过可见性跳变实现

---

## 8. 与 three-map 的落地映射

建议把当前实现收敛为以下约束：

1. `SurfaceSystem` 是唯一 surface 编排入口
2. `TerrainTileLayer` 提供 geometry host 能力（含默认 ellipsoid host）
3. `RasterLayer` 不单独管理父级覆盖 mesh，只提供 host 内 imagery chain 数据
4. planner 输出 host tile 集合；具体 imagery 取样级别由 raster 自己判定

强约束：

- 禁止 `RasterLayer` 直接依赖 `GlobeMesh`
- 禁止“没 terrain layer 就无影像”
- 禁止 imagery target level = terrain target level 的硬绑定

---

## 9. 常见故障与归因

故障 1：加了 raster source 但只有 terrain 时才显示  
归因：缺失默认 ellipsoid host  
修复：内核默认挂椭球地形 provider

故障 2：source 配了 maxZoom=18 但最多只请求到 14  
归因：imagery LOD 被 terrain LOD 硬钳  
修复：独立 imagery LOD 判定

故障 3：影像/地形/GlobeMesh 交替闪烁  
归因：父影像独立 mesh + 非原子替换  
修复：host 内祖先链合成 + 父保留子原子替换

故障 4：黑块或灰块穿刺  
归因：host 不连续或占位几何先露出、纹理后到  
修复：以可渲染祖先 host 兜底，目标资源 ready 再切换

---

## 10. 验收清单（本章落地标准）

满足以下项，说明 terrain/imagery 解耦基本达标：

1. 无 terrain provider 时，影像可在 ellipsoid 上正常显示
2. imagery 请求级别可达到 imagery source maxZoom（在屏幕误差需要时）
3. terrain 较粗时仍可采样更高等级影像
4. 影像覆盖后不再出现 GlobeMesh/占位块交替闪烁
5. `SurfaceSystem` 统一管理 host 及组合，业务 layer 不穿透内部 mesh

---

## 11. 对应 Cesium 参考源码

- `packages/engine/Source/Scene/Globe.js`
- `packages/engine/Source/Core/EllipsoidTerrainProvider.js`
- `packages/engine/Source/Core/TerrainProvider.js`
- `packages/engine/Source/Scene/ImageryProvider.js`
- `packages/engine/Source/Scene/ImageryLayer.js`
- `packages/engine/Source/Scene/TileImagery.js`
- `packages/engine/Source/Scene/Imagery.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`

建议阅读顺序：

1. 先看 `Globe` 如何挂 terrain/imagery
2. 再看 `ImageryLayer` 如何选择 imagery level 与 skeleton
3. 最后看 `GlobeSurfaceTileProvider` 如何在 host tile 上组合提交
