# Globe Engine Knowledge Base

本知识库从以下两个代码库提炼工程经验，并整理为可直接落地的地球引擎实现手册：

- `/Users/ldy/Desktop/map/cesium`
- `/Users/ldy/Desktop/map/3DTilesRendererJS`

目标：当你按本目录逐章实现后，应具备开发"完整地球引擎"（globe + terrain + imagery + 3d tiles + 调度 + 过渡稳定性）的能力。

## 快速导航

- **[知识库完整性分析](./00-knowledge-gap-analysis.md)** - 遗漏项、性能关键点、总体架构图

## 阅读顺序

### 第一部分：架构基础（Cesium/3DTilesRendererJS经验）
1. `01-cesium-surface-architecture.md`
2. `02-quadtree-sse-selection.md`
3. `03-terrain-imagery-decoupling.md`
4. `04-request-scheduling-cache-lifecycle.md`
5. `05-crack-transition-stability.md`
6. `06-coordinate-system-and-precision.md`
7. `07-3dtilesrendererjs-runtime-plugin.md`

### 第二部分：完整蓝图与验证
8. `08-complete-engine-blueprint.md`
9. `09-validation-checklist.md`

### 第三部分：Three.js实现细节
10. `10-threejs-rendering-integration.md`
11. `11-custom-shaders-and-materials.md`
12. `12-performance-optimization-patterns.md`
13. `13-error-handling-and-recovery.md`
14. `14-worker-concurrency-patterns.md`
15. `15-testing-strategies.md`
16. `16-practical-code-examples.md`

### 第四部分：深入实现（补充）
17. `17-webgl-rendering-pipeline.md` - WebGL 渲染管线详解
18. `18-texture-gpu-management.md` - 纹理与 GPU 内存管理
19. `19-ellipsoid-geodesy.md` - 椭球体和大地测量
20. `20-atmosphere-lighting.md` - 大气和光照渲染
21. `21-water-rendering.md` - 水面渲染
22. `22-camera-system-deep-dive.md` - 相机系统深入

### 第五部分：接口与集成
23. `23-public-api-contract.md` - 公共 API 接口约定（含坐标系支持、请求加工）
24. `24-vector-tile-rendering.md` - 矢量瓦片渲染

### 第六部分：高级功能
25. `25-advanced-features.md` - GPU拾取、手势处理、后处理、日夜交替、云层

## 结论

这套知识覆盖了完整地球引擎的最小闭环：

- 引擎编排：Scene -> Globe/Surface -> Quadtree -> Provider -> GPU pass
- 数据表达：TerrainProvider / ImageryProvider / 3DTiles Runtime
- LOD 与收敛：SSE 细化、父子切换、祖先回退、原子替换
- 资源治理：请求调度、缓存淘汰、状态机、引用计数
- 视觉稳定：裂缝、极区、穿刺、闪烁、精度抖动控制

## 性能关键点

详见 [知识库完整性分析](./00-knowledge-gap-analysis.md)：

- **渲染性能**：Draw Call < 1000、纹理切换 < 100次/帧、顶点 < 1M/帧
- **内存预算**：GPU纹理 512MB、GPU几何 256MB、CPU瓦片缓存 200MB
- **网络性能**：并发 < 8、缓存命中率 > 80%、平均加载 < 100ms
- **计算性能**：SSE 计算增量更新、坐标转换批处理、碰撞检测空间索引

## 待补充章节

- 暂无（知识库完整度已达标）

## 已补充章节

- [x] 17: WebGL Rendering Pipeline - WebGL 渲染管线详解
- [x] 18: Texture & GPU Memory Management - 纹理与 GPU 内存管理
- [x] 19: Ellipsoid & Geodesy - 椭球体和大地测量
- [x] 20: Atmosphere & Lighting - 大气和光照渲染
- [x] 21: Water Rendering - 水面渲染
- [x] 22: Camera System Deep Dive - 相机系统深入
- [x] 23: Public API Contract - 公共 API 接口约定（含坐标系支持、请求加工）
- [x] 24: Vector Tile Rendering - 矢量瓦片渲染
- [x] 25: Advanced Features - GPU拾取、手势、后处理、日夜交替、云层

## 已扩展章节

- [x] 02: 瓦片金字塔完整实现（新增第14节）
- [x] 06: 椭球体建模详细实现 + 精度抖动详解（新增第13、14节）
- [x] 22: 相机防钻地系统详解（新增第6节）
- [x] 23: 渐变线支持（新增第5.8节）
- [x] 23: 坐标系支持（高德/百度/天地图/4326投影适配）
- [x] 23: 请求加工支持（签名/加密/Token）

