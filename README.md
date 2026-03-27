# three-map

基于 `three.js` 和 `Rspack` 的轻量地球引擎第四阶段实现。

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
- `src/layers`: 基础影像层、视角驱动在线瓦片层、真实高程层、标记层、折线层、多边形层与图层管理
- `src/engine`: 引擎装配、事件系统与对外 API
- `src/tiles`: 在线瓦片缓存、调度、视口 LOD 与可见区域计算
- `src/globe`: 球体、程序化地形、大气层与星空
- `src/utils`: 通用事件发射器
- `examples`: 第四阶段示例
- `docs`: 设计、计划和验收文档

## 第四阶段能力

- 影像层按当前视角和屏幕尺寸自适应选择 zoom 与可见瓦片，不再启动即全量拉全球
- DEM 高程层支持在线 Terrarium 高程瓦片，并将真实高程位移应用到球体几何
- 鼠标拖拽和滚轮缩放都支持惯性，力度越大，释放后的续动越明显
- 示例入口改为动态导入，重型 demo/runtime 从首屏壳层拆出异步 chunk
