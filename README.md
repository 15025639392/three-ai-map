# three-map

基于 `three.js` 和 `Rspack` 的轻量级 3D 地图引擎，支持地球渲染、在线瓦片、真实高程、空间计算、坐标转换和丰富的可视化图层。

## 特性

### 渲染核心
- 3D 地球渲染（球体 mesh + 程序化地形 + 大气层 + 星空背景）
- WebMercator XYZ 在线瓦片影像加载（URL 模板；按视口选择可见瓦片）
- Terrarium DEM 真实高程解码与顶点位移（支持 Worker，自动回退主线程）
- Surface Tile Mesh：逐瓦片曲面 patch mesh，影像 + 高程绑定到同一 mesh
- SurfaceTile 影像请求支持可配置重试与降级（重试耗尽后可回退到纯色占位）
- ElevationLayer tile-load 支持可配置重试（支持 layer 默认值与 engine 统一策略覆盖）
- VectorTileLayer tile-parse 支持可配置重试与空结果降级（可按规则触发 fallback）
- GlobeEngine 支持 `recoveryPolicy` 统一恢复策略入口（按 `stage/category/severity` 覆盖图层恢复行为）
- 混合 LOD 叶子集：中心区域细化一级、外围保留父级，降低深缩放开销
- 防缝隙：skirt + UV inset，抑制跨瓦片/跨 LOD 边缘裂缝
- 提供视锥裁剪工具（FrustumCuller，可用于自定义裁剪/调试）
- 按需渲染：仅在交互和状态变更时触发渲染
- 倾斜摄影：`ObliquePhotogrammetryLayer` 支持 `3D Tiles`（`boundingVolume.region` / `extras.obliqueCenter`）适配、可见性更新与节点级拾取
- 提供 23 个 deterministic 回归场景（7 个 SurfaceTile + 7 个 Basic Globe Performance/Profile/Ladder/Recovery/RecoveryStress/RecoveryEndurance/RecoveryDrift + 6 个 VectorTile + 1 个 Projection + 1 个 Terrarium decode + 1 个 Oblique Photogrammetry）

### 交互
- Arcball 轨迹球鼠标拖拽，跨极自由旋转
- 滚轮缩放 + 阻尼惯性
- 统一点击事件系统（射线拾取 + 统一 PickResult）
- 统一错误事件系统（`engine.on("error", ...)` 接收 layer 异步失败，包含阶段、分类、严重级别）
- 触摸手势工具（GestureController，需自行绑定 touch 事件）

### 图层系统
- **基础图层**：标记点（MarkerLayer）、折线（PolylineLayer）、多边形（PolygonLayer）
- **影像图层**：单张纹理（ImageryLayer）
- **瓦片图层**：Surface Tile（SurfaceTileLayer，瓦片影像 + 高程）、全局高程（ElevationLayer）
- **高级图层**：矢量瓦片（VectorTileLayer，MVT 渲染 MVP）、实例化标记（InstancedMarkerLayer）、聚合（ClusterLayer）、热力图（HeatmapLayer）、自定义图层（CustomLayer）

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
- 后处理参数管理（Bloom、色彩校正）
- `GlobeEngine#getPerformanceReport()` / `resetPerformanceReport()` 引擎级性能报告
- 恢复策略命中指标：`recoveryPolicyQueryCount` / `recoveryPolicyHitCount` / `recoveryPolicyRuleHitCount`
- 恢复策略分桶指标：`recoveryPolicy*Count:<stage>`（例如 `recoveryPolicyQueryCount:imagery`）

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run test:run    # 运行单元测试
npm run typecheck   # TypeScript 严格模式
npm run build       # 生产构建
npm run datasets:oblique:validate   # 校验 oblique 3D Tiles manifest/schema 与本地 fixture checksum
npm run datasets:oblique:download   # 下载 manifest 中 remote-reference 数据并做 size/sha256 校验
npm run test:datasets:oblique:fault-gates  # 故障注入：校验下载不可达/checksum失配/strict-remote缺缓存门禁
npm run test:browser:surface-tiles  # SurfaceTile deterministic browser smoke
npm run test:metrics:baseline        # 基于 smoke 产物执行指标基线漂移断言
npm run test:map-engine             # 首阶段统一质量入口
```

浏览器 smoke 会校验二十三个确定性 demo：`examples/surface-tile-regression.ts`、`examples/surface-tile-resize-regression.ts`、`examples/surface-tile-zoom-regression.ts`、`examples/surface-tile-recovery-stages-regression.ts`、`examples/surface-tile-coord-transform-regression.ts`、`examples/surface-tile-lifecycle-regression.ts`、`examples/surface-tile-lifecycle-stress-regression.ts`、`examples/basic-globe-performance-regression.ts`、`examples/basic-globe-load-profile-regression.ts`、`examples/basic-globe-load-ladder-regression.ts`、`examples/basic-globe-load-recovery-regression.ts`、`examples/basic-globe-load-recovery-stress-regression.ts`、`examples/basic-globe-load-recovery-endurance-regression.ts`、`examples/basic-globe-load-recovery-drift-regression.ts`、`examples/oblique-photogrammetry-regression.ts`、`examples/vector-tile-regression.ts`、`examples/projection-regression.ts`、`examples/terrarium-decode-regression.ts`、`examples/vector-pick-regression.ts`、`examples/vector-geometry-pick-regression.ts`、`examples/vector-multi-tile-pick-regression.ts`、`examples/vector-overlap-pick-regression.ts`、`examples/vector-layer-zindex-pick-regression.ts`，并在 `test-results/` 下输出截图、DOM 快照与指标 JSON（`surface-tile-zoom-regression-metrics.json`、`surface-tile-recovery-stages-regression-metrics.json`、`surface-tile-coord-transform-regression-metrics.json`、`surface-tile-lifecycle-regression-metrics.json`、`surface-tile-lifecycle-stress-regression-metrics.json`、`basic-globe-performance-regression-metrics.json`、`basic-globe-load-profile-regression-metrics.json`、`basic-globe-load-ladder-regression-metrics.json`、`basic-globe-load-recovery-regression-metrics.json`、`basic-globe-load-recovery-stress-regression-metrics.json`、`basic-globe-load-recovery-endurance-regression-metrics.json`、`basic-globe-load-recovery-drift-regression-metrics.json`、`oblique-photogrammetry-regression-metrics.json`、`vector-tile-regression-metrics.json`、`projection-regression-metrics.json`、`terrarium-decode-regression-metrics.json`、`vector-pick-regression-metrics.json`、`vector-geometry-pick-regression-metrics.json`、`vector-multi-tile-pick-regression-metrics.json`、`vector-overlap-pick-regression-metrics.json`、`vector-layer-zindex-pick-regression-metrics.json`）。
smoke 阈值断言当前覆盖 imagery / tile-load / tile-parse 恢复指标、SurfaceTile 坐标转换与生命周期（单轮 + 压力）一致性指标、Basic Globe pan/zoom 性能 + 双画像 + 负载阶梯 + 负载恢复 + 负载恢复压力 + 负载恢复耐久 + 负载恢复漂移门禁、Oblique Photogrammetry 可见节点/深度/拾取指标、Terrarium decode worker-hit/fallback 指标，以及 VectorTile 点/线/面、多 tile 边界、重叠要素优先级与跨图层 zIndex pick 精度门禁。
CI workflow：`.github/workflows/map-engine-checks.yml` 会在 PR / main(master) push 时执行 `npm run test:map-engine`（含 `test:metrics:baseline`），并上传 `test-results/*.png|*.html|*.json` 作为回归证据。
`test:map-engine` 会先执行 `datasets:oblique:validate` 与 `test:datasets:oblique:fault-gates`，确保 oblique 3D Tiles 数据清单、schema、fixture checksum 与下载链路负向门禁（不可达/校验失配）均可用。
baseline 配置默认位于 `scripts/map-engine-metrics-baseline.config.json`，可通过环境变量 `MAP_ENGINE_METRICS_BASELINE_CONFIG` 在 CI 切换。
CI 平台矩阵当前为 `ubuntu-latest` + `macos-latest`，分别映射 `scripts/map-engine-metrics-baseline.linux.json` 与 `scripts/map-engine-metrics-baseline.macos.json`。
metrics baseline 断言会输出 `test-results/map-engine-metrics-baseline-diff.json`，失败时用于直接定位超阈值指标。

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
| `src/workers` | Web Worker（Terrarium DEM 解码） |
| `examples` | 示例代码 |
| `docs` | 设计、计划和验收文档 |
| `docs/performance` | 基线数据与性能记录 |

## 快速开始

```typescript
import {
  GlobeEngine,
  SurfaceTileLayer,
} from "./src";

const container = document.getElementById("globe")!;
const engine = new GlobeEngine({
  container,
  radius: 1,
  background: "#020611",
  recoveryPolicy: {
    rules: [
      {
        stage: "imagery",
        category: "network",
        severity: "warn",
        overrides: {
          imageryRetryAttempts: 2,
          imageryRetryDelayMs: 120,
          imageryFallbackColor: "#1b2330"
        }
      },
      {
        stage: "tile-load",
        category: "network",
        severity: "warn",
        overrides: {
          elevationRetryAttempts: 2,
          elevationRetryDelayMs: 80
        }
      },
      {
        stage: "tile-parse",
        category: "data",
        severity: "warn",
        overrides: {
          vectorParseRetryAttempts: 1,
          vectorParseRetryDelayMs: 0,
          vectorParseFallbackToEmpty: true
        }
      }
    ]
  }
});

// Surface tiles（瓦片影像 + 高程）
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

engine.on("error", ({ layerId, stage, category, severity, error, tileKey }) => {
  console.error("layer error", layerId, stage, category, severity, tileKey, error);
});
```

更多示例参见 `examples/basic-globe.ts`、`examples/tile-sources-gaode-baidu.ts`。

## API 概览

| 类别 | 导出 |
|------|------|
| 核心 | `GlobeEngine`, `GlobeEngineEvents`, `GlobeEngineOptions`, `GlobeEngineRecoveryPolicy`, `GlobeEngineRecoveryRule`, `EngineView` |
| 图层 | `Layer`, `LayerErrorPayload`, `LayerErrorCategory`, `LayerErrorSeverity`, `LayerRecoveryQuery`, `LayerRecoveryOverrides`, `MarkerLayer`, `PolylineLayer`, `PolygonLayer`, `ImageryLayer` |
| 瓦片 | `ElevationLayer`, `SurfaceTileLayer`, `SurfaceTileLayerOptions`, `CoordTransformFn`, `defaultTileLoader`, `corsTileLoader`, `TileSource` |
| 高级 | `VectorTileLayer`（MVT 渲染 MVP）, `InstancedMarkerLayer`, `ClusterLayer`, `HeatmapLayer`, `CustomLayer` |
| 空间 | `haversineDistance`, `greatCircleDistance`, `polygonArea`, `pointInPolygon`, `distanceToLine`, `bearing` |
| 坐标 | `wgs84ToGcj02`, `gcj02ToWgs84`, `wgs84ToBd09`, `gcj02ToBd09`, `bd09ToGcj02` |
| 投影 | `Projection`, `ProjectionType` (WebMercator / Equirectangular / Geographic) |
| 系统 | `AnimationManager`, `GestureController`, `PerformanceMonitor`, `PerformanceReport`, `PostProcessing`, `FrustumCuller`, `SpatialIndex` |

对外导出以 `src/index.ts` 为准；设计与问题清单参见 `docs/`。

## 技术栈

- **TypeScript** (strict mode)
- **three.js** v0.176
- **Rspack** v1.2
- **Vitest** 测试框架
- **Web Workers** 异步解码

## 许可

Private
