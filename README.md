# three-map

基于 `three.js` 和 `Rspack` 的轻量地球引擎第三阶段实现。

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
- `src/globe`: 地球宿主 mesh 与材质
- `src/layers`: 基础影像层、在线瓦片层、标记层、折线层、多边形层与图层管理
- `src/engine`: 引擎装配、事件系统与对外 API
- `src/tiles`: 在线瓦片缓存与调度
- `src/globe`: 球体、程序化地形、大气层与星空
- `src/utils`: 通用事件发射器
- `examples`: 第三阶段示例
- `docs`: 设计、计划和验收文档
