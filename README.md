# three-map

基于 `three.js` 和 `Rspack` 的轻量地球引擎第五阶段实现。

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run test:run
npm run typecheck
npm run build
```

## 目录

- `src/core`: 渲染器、帧循环、相机控制
- `src/geo`: 经纬度与射线求交
- `src/globe`: 地球宿主 mesh、材质与真实高程位移
- `src/layers`: 基础影像层、视角驱动在线瓦片层、真实高程层、统一 surface tile mesh 层、标记层、折线层、多边形层与图层管理
- `src/engine`: 引擎装配、事件系统与对外 API
- `src/tiles`: 在线瓦片缓存、调度、视口 LOD、可见区域计算与 surface tile 选择
- `src/globe`: 球体、程序化地形、大气层与星空
- `src/utils`: 通用事件发射器
- `examples`: 第五阶段示例
- `docs`: 设计、计划和验收文档

## 第五阶段能力

- 新增统一的球面 surface tile mesh 图层，将在线影像和 Terrarium DEM 绑定到同一批曲面 patch mesh
- surface tile 会按当前视角选择可见 tile，并在更深的 zoom 上提供比第四阶段更细的局部细节
- 第四阶段的全球自适应影像与真实高程保留为兜底底图，surface tile 加载失败时仍可继续浏览
- 鼠标拖拽和滚轮缩放都支持惯性，力度越大，释放后的续动越明显
- 示例入口改为动态导入，重型 demo/runtime 从首屏壳层拆出异步 chunk
