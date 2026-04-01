# 08 Complete Engine Blueprint

## 1. 目标模块

按正规引擎思路，完整地球引擎最小模块如下：

1. `Engine Core`
2. `Scene/Frame Graph`
3. `Globe/Surface System`
4. `Quadtree LOD`
5. `Terrain Provider`
6. `Imagery Provider + Layer Stack`
7. `Request Scheduler`
8. `Tile Cache + Lifecycle`
9. `Terrain/Imagery Composition`
10. `Crack/Transition Stabilizer`
11. `Coordinate/Precision System`
12. `3D Tiles Runtime`
13. `Camera/Interaction`
14. `Diagnostics/Test Harness`

## 2. 推荐依赖方向（单向）

- Scene -> Surface -> Quadtree -> Provider
- Scene -> Overlay Layers
- Surface -> RequestScheduler / Cache
- Overlay 不允许反向依赖 Surface 内部网格实现

## 3. Host Tile 渲染策略（Cesium式）

- active host tile 内执行祖先影像链合成
- 地形子节点 ready 后原子替换
- 子未 ready 时父级保留
- 无地形数据时使用 ellipsoid host 承载影像

## 4. 实施阶段

- P0：稳定底座（SSE、队列、缓存、祖先回退）
- P1：质量与正确性（裂缝、极区、过渡、防闪烁）
- P2：扩展（3D Tiles 插件化、诊断与性能工具）

