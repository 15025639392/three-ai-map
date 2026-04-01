# 06 Coordinate System And Precision

## 1. 坐标主干

Cesium 主干是：

- CPU：`Cartographic(经纬高)` + `Cartesian3(ECEF)`
- 2D/CV：通过 map projection（Geographic/WebMercator）
- GPU：高精度 RTE + tile RTC

关键源码：

- `packages/engine/Source/Core/Cartographic.js`
- `packages/engine/Source/Core/Ellipsoid.js`
- `packages/engine/Source/Core/EncodedCartesian3.js`
- `packages/engine/Source/Shaders/Builtin/Functions/translateRelativeToEye.glsl`
- `packages/engine/Source/Shaders/GlobeVS.glsl`

## 2. 抖动控制双策略

1. GPU RTE：`high/low` 编码 + 相机相对平移
2. Tile RTC：每个 tile 用 `u_center3D` 降低坐标量级

## 3. 坐标系迁移检查清单

1. 明确 world 右手系，定义 east/north/up 与 camera forward。
2. 经纬到世界坐标映射要单向一致，禁止“再镜像补丁”。
3. 输入交互（上下左右）和地理方向要做自动化回归验证。

