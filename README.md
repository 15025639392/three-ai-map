# three-map

基于 `three.js` 和 `Rspack` 的轻量级 3D 地图引擎，支持地球渲染、在线瓦片、真实高程、空间计算、坐标转换和丰富的可视化图层。

## 特性

### 渲染核心
- 3D 地球渲染（球体 mesh + 程序化地形 + 大气层 + 星空背景）
- WebMercator 在线瓦片影像加载与 Equirectangular 实时重投影
- Terrarium DEM 真实高程数据加载与顶点位移
- 统一 Surface Tile Mesh：影像 + DEM 绑定到同一批曲面 patch mesh
- 混合 LOD 四叉树：中心区域细化、外围保留父级，降低深缩放开销
- Worker 化：重投影和 DEM 解码优先走 worker，自动回退主线程
- 视锥裁剪（FrustumCuller）减少无效渲染
- 按需渲染：仅在交互和状态变更时触发渲染

### 交互
- Arcball 轨迹球鼠标拖拽，跨极自由旋转
- 滚轮缩放 + 阻尼惯性
- 统一点击事件系统（射线拾取 + 统一 PickResult）
- 触摸手势支持（单指平移、双指捏合、双指旋转）

### 图层系统
- **基础图层**：标记点（MarkerLayer）、折线（PolylineLayer）、多边形（PolygonLayer）
- **瓦片图层**：在线影像（TiledImageryLayer）、真实高程（ElevationLayer）、Surface Tile（SurfaceTileLayer）
- **高级图层**：矢量瓦片（VectorTileLayer）、实例化标记（InstancedMarkerLayer）、聚合（ClusterLayer）、热力图（HeatmapLayer）、自定义图层（CustomLayer）

### 空间计算
- Haversine / 大圆距离计算
- 多边形面积计算（平面 + 球面）
- 点在多边形判断、点到线距离、方位角
- 四叉树空间索引（O(log n) 查询）

### 坐标系与投影
- WGS84 / GCJ02 / BD09 坐标转换（支持中国地图数据）
- WebMercator / Equirectangular / Geographic 三种投影系统

### 动画与性能
- 动画过渡系统（多种缓动函数）
- 性能监控（FPS、帧时间、内存、自定义指标）
- 后处理效果（泛光、色彩校正）

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run test:run    # 197 个单元测试
npm run typecheck   # TypeScript 严格模式
npm run build       # 生产构建
```

## 目录

| 目录 | 说明 |
|------|------|
| `src/core` | 渲染器、帧循环、相机控制、动画、手势、性能监控、后处理 |
| `src/geo` | 经纬度转换、椭球体、射线求交 |
| `src/globe` | 地球 mesh、程序化地形、大气层、星空 |
| `src/layers` | 全部图层：影像、瓦片、标记、折线、多边形、矢量、聚合、热力图、自定义 |
| `src/projection` | 投影系统（WebMercator / Equirectangular / Geographic） |
| `src/spatial` | 空间计算（距离、面积、关系）、坐标转换、空间索引 |
| `src/tiles` | 瓦片缓存、调度、视口 LOD、Surface Tile 选择、视锥裁剪 |
| `src/engine` | 引擎装配、事件系统、对外 API |
| `src/utils` | 通用事件发射器 |
| `src/workers` | Web Worker（重投影查找、DEM 解码） |
| `examples` | 示例代码 |
| `docs` | 设计、计划和验收文档 |

## 快速开始

```typescript
import {
  GlobeEngine,
  TiledImageryLayer,
  ElevationLayer,
  SurfaceTileLayer,
  ImageryLayer
} from "./src";

const container = document.getElementById("globe")!;
const engine = new GlobeEngine({ container, radius: 1, background: "#020611" });

// 在线瓦片影像
const imagery = new TiledImageryLayer("imagery", {
  minZoom: 1,
  maxZoom: 8,
  tileSize: 128,
  cacheSize: 48,
  concurrency: 4
});
engine.addLayer(imagery);

// 真实高程
const elevation = new ElevationLayer("elevation", {
  zoom: 3,
  exaggeration: 1
});
engine.addLayer(elevation);

// 高精度 Surface Tile
const surface = new SurfaceTileLayer("surface", {
  minZoom: 3,
  maxZoom: 11,
  meshSegments: 16,
  skirtDepthMeters: 1400
});
engine.addLayer(surface);

// 设置视角
engine.setView({ lng: 110, lat: 28, altitude: 2.4 });

// 点击拾取
engine.on("click", ({ pickResult }) => {
  if (pickResult?.type === "globe") {
    console.log(`lng:${pickResult.cartographic.lng} lat:${pickResult.cartographic.lat}`);
  }
});
```

## API 概览

| 类别 | 导出 |
|------|------|
| 核心 | `GlobeEngine`, `GlobeEngineOptions`, `EngineView` |
| 图层 | `Layer`, `MarkerLayer`, `PolylineLayer`, `PolygonLayer`, `ImageryLayer` |
| 瓦片 | `TiledImageryLayer`, `ElevationLayer`, `SurfaceTileLayer` |
| 高级 | `VectorTileLayer`, `InstancedMarkerLayer`, `ClusterLayer`, `HeatmapLayer`, `CustomLayer` |
| 空间 | `haversineDistance`, `greatCircleDistance`, `polygonArea`, `pointInPolygon`, `distanceToLine`, `bearing` |
| 坐标 | `wgs84ToGcj02`, `gcj02ToWgs84`, `gcj02ToBd09`, `bd09ToGcj02` |
| 投影 | `Projection`, `ProjectionType` (WebMercator / Equirectangular / Geographic) |
| 系统 | `AnimationManager`, `GestureController`, `PerformanceMonitor`, `PostProcessing`, `FrustumCuller`, `SpatialIndex` |

详细 API 文档参见 `docs/api/` 目录。

## 技术栈

- **TypeScript** (strict mode)
- **three.js** v0.176
- **Rspack** v1.2
- **Vitest** 测试框架
- **Web Workers** 异步解码

## 许可

Private
