# Globe Engine Knowledge Base

本知识库从以下两个代码库提炼工程经验，并整理为可直接落地的地球引擎实现手册：

- `/Users/ldy/Desktop/map/cesium`
- `/Users/ldy/Desktop/map/3DTilesRendererJS`

目标：当你按本目录逐章实现后，应具备开发“完整地球引擎”（globe + terrain + imagery + 3d tiles + 调度 + 过渡稳定性）的能力。

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

## 结论

这套知识覆盖了完整地球引擎的最小闭环：

- 引擎编排：Scene -> Globe/Surface -> Quadtree -> Provider -> GPU pass
- 数据表达：TerrainProvider / ImageryProvider / 3DTiles Runtime
- LOD 与收敛：SSE 细化、父子切换、祖先回退、原子替换
- 资源治理：请求调度、缓存淘汰、状态机、引用计数
- 视觉稳定：裂缝、极区、穿刺、闪烁、精度抖动控制

