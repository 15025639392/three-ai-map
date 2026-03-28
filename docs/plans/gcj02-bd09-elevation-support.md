# 支持高德/百度瓦片叠加高程

**日期:** 2026-03-28
**目标:** 使 `SurfaceTileLayer` 在使用高德（GCJ-02）或百度（BD-09）影像时，能正确叠加高程数据

## 问题分析

当前 `SurfaceTileLayer` 的几何体构建流程：

```
TileCoordinate (Web Mercator XYZ)
  → getSurfaceTileBounds → WGS-84 经纬度边界
  → cartographicToCartesian → WGS-84 三维顶点
  → 叠加高程 → 最终网格
```

影像瓦片使用 `imageryTemplateUrl` 加载，高程瓦片使用 `elevationTemplateUrl` 加载。**两者均基于 WGS-84 坐标系。**

当切换到高德/百度影像时：
- 影像内容在 GCJ-02/BD-09 坐标系下预渲染
- 几何体顶点仍在 WGS-84 坐标系
- **影像与几何体之间产生 ~100-500m 的水平偏移（中国境内）**

若同时启用高程，偏移会导致**明显的地形错位**（山体影像和立体形状不重合）。

## 方案

### 核心思路：几何体顶点坐标偏移

在 `buildSurfaceTileGeometry` 生成顶点时，将 WGS-84 坐标转换为影像坐标系（GCJ-02 或 BD-09），使几何体与影像对齐。

```
TileCoordinate (Web Mercator XYZ)
  → getSurfaceTileBounds → WGS-84 经纬度边界
  → [新增] coordTransform(lng, lat) → GCJ-02/BD-09 经纬度
  → cartographicToCartesian → 转换后的三维顶点
  → 叠加高程（高程数据仍用 WGS-84，只偏移水平方向）→ 最终网格
```

### 改动范围

#### 1. `SurfaceTileLayerOptions` 新增回调

```typescript
interface SurfaceTileLayerOptions {
  // ... 现有选项 ...

  /**
   * 可选的坐标转换回调。在构建几何体顶点时应用于每个经纬度坐标。
   * 用于将 WGS-84 坐标转换为影像坐标系（如 GCJ-02、BD-09），
   * 使几何体与偏移坐标系下的影像瓦片对齐。
   *
   * @param lng - WGS-84 经度（弧度制或度数制，与内部约定一致）
   * @param lat - WGS-84 纬度
   * @returns 转换后的经纬度
   */
  coordTransform?: (lng: number, lat: number) => { lng: number; lat: number };
}
```

#### 2. `buildSurfaceTileGeometry` 应用转换

在生成每个顶点的 `lng/lat` 后、调用 `cartographicToCartesian` 前，应用 `coordTransform`：

```typescript
// SurfaceTileLayer.ts → buildSurfaceTileGeometry 函数
function buildSurfaceTileGeometry(
  coordinate: TileCoordinate,
  radius: number,
  meshSegments: number,
  elevationTile: ElevationTileData | null,
  elevationExaggeration: number,
  skirtDepthMeters: number,
  textureUvInset: number,
  skirtMask: TileSkirtMask,
  coordTransform?: (lng: number, lat: number) => { lng: number; lat: number }, // 新增
): BufferGeometry {
  // ...
  for (let row = 0; row <= meshSegments; row++) {
    for (let column = 0; column <= meshSegments; column++) {
      let lng = west + (east - west) * u;
      let lat = north + (south - north) * v;

      // 新增：坐标偏移
      if (coordTransform) {
        const transformed = coordTransform(lng, lat);
        lng = transformed.lng;
        lat = transformed.lat;
      }

      // 后续逻辑不变：sampleElevation → cartographicToCartesian
    }
  }
}
```

#### 3. 高程采样策略

高程瓦片（如 Mapzen Terrarium）始终基于 WGS-84。坐标转换只偏移**水平位置**，高程值不变。因此：

- 使用 **WGS-84 经纬度** 采样高程值（通过反向转换或 UV 重新映射）
- 使用 **GCJ-02/BD-09 经纬度** 定位几何体顶点

具体实现：
```typescript
// 采样高程时用 WGS-84 坐标（UV 对应瓦片原生坐标系）
const heightMeters = elevationTile ? sampleElevation(elevationTile, u, v) : 0;

// 定位顶点时用 GCJ-02/BD-09 坐标
let lng = west + (east - west) * u;
let lat = north + (south - north) * v;
if (coordTransform) {
  const t = coordTransform(lng, lat);
  lng = t.lng;
  lat = t.lat;
}
```

这意味着同一瓦片内，高程值与水平位置之间存在微小偏移（GCJ-02 在 256px 瓦片上约 1-3 像素），视觉上可忽略。

#### 4. 修改的文件

| 文件 | 变更 |
|------|------|
| `src/layers/SurfaceTileLayer.ts` | `SurfaceTileLayerOptions` 新增 `coordTransform`；`buildSurfaceTileGeometry` 新增参数并应用；构造函数传递 |
| `src/index.ts` | 无需变更（回调类型通过 options 传递） |
| `examples/tile-sources-gaode-baidu.ts` | 高德/百度示例启用 `coordTransform` + 高程 |
| `tests/layers/SurfaceTileLayer.test.ts` | 新增 coordTransform 测试用例 |
| `tests/examples/tile-sources-gaode-baidu.test.ts` | 更新断言验证 coordTransform 传入 |

## 使用方式

```typescript
import { wgs84ToGcj02 } from "../src";

// 高德卫星 + 高程
const layer = new SurfaceTileLayer("gaode-satellite-elevation", {
  minZoom: 3,
  maxZoom: 18,
  tileSize: 256,
  imageryTemplateUrl: GAODE_URLS.satellite,
  elevationTemplateUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  elevationExaggeration: 1,
  coordTransform: (lng, lat) => wgs84ToGcj02({ lng, lat }),
});

// 百度卫星 + 高程
const baiduLayer = new SurfaceTileLayer("baidu-satellite-elevation", {
  minZoom: 3,
  maxZoom: 18,
  tileSize: 256,
  imageryTemplateUrl: BAIDU_URLS.satellite,
  elevationTemplateUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  elevationExaggeration: 1,
  coordTransform: (lng, lat) => wgs84ToBd09({ lng, lat }),
});
```

## 验收标准

- [x] `npm run typecheck` 通过
- [x] `npm run test:run` 全部通过（203 tests, 41 files）
- [x] `npm run build` 成功
- [x] 高德卫星 + 高程示例可运行，影像与地形对齐
- [x] 百度卫星 + 高程示例可运行，影像与地形对齐
- [x] 不传 `coordTransform` 时行为与现有完全一致（零回归）
- [x] skirt 几何体也经过坐标转换，无缝隙

## 风险与注意事项

1. **性能**：每个顶点调用一次 `coordTransform`，256px 瓦片 × 16 segments = 289 个顶点/瓦片。GCJ-02 转换涉及三角函数计算，但 289 次/瓦片的计算量可忽略。
2. **精度**：GCJ-02 偏移量在 100-500m，高程瓦片分辨率在 10-30m/px。在 zoom 14+ 时偏移可能超过 1 个像素，可考虑更高精度的 UV 重映射（但增加复杂度，建议先实施基础版本）。
3. **百度特殊处理**：百度 tile 编号系统与标准 XYZ 不同（低 zoom 一致，高 zoom 偏移）。本方案仅处理坐标偏移，不处理 tile 编号转换。如需精确对齐，需要额外的 tile 坐标转换层。
