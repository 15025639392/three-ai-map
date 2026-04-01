# 16 Practical Code Examples

## 1. 目标与边界

本章提供地球引擎的实际代码示例：

1. 从零开始创建地球引擎
2. 添加各种图层和数据源
3. 实现常见功能和优化

本章聚焦实际代码，不讨论底层架构。

---

## 2. 快速开始

### 2.1 最小示例

```typescript
import { GlobeEngine, TerrainTileLayer, RasterTileSource, RasterLayer } from "./src";

// 1. 创建引擎
const container = document.getElementById("globe")!;
const engine = new GlobeEngine({
  container,
  radius: 1,
  background: "#020611"
});

// 2. 添加地形图层
const terrain = new TerrainTileLayer("terrain", {
  terrain: {
    tiles: [
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    ],
    encode: "terrarium",
    minZoom: 3,
    maxZoom: 11,
    tileSize: 256
  },
  meshSegments: 16,
  skirtDepthMeters: 1400
});
engine.addLayer(terrain);

// 3. 添加影像图层
engine.addSource(
  "osm",
  new RasterTileSource("osm", {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    cache: 256,
    concurrency: 8
  })
);
engine.addLayer(new RasterLayer({ id: "osm", source: "osm", opacity: 1 }));

// 4. 设置视角
engine.setView({ lng: 110, lat: 28, altitude: 2.4 });

// 5. 监听点击事件
engine.on("click", ({ pickResult }) => {
  if (pickResult?.type === "globe") {
    console.log(`Clicked at: ${pickResult.cartographic.lng}, ${pickResult.cartographic.lat}`);
  }
});
```

---

## 3. 数据源配置

### 3.1 高德地图瓦片

```typescript
// 高德地图影像
const gaodeSource = new RasterTileSource("gaode-satellite", {
  tiles: [
    "https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
    "https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
    "https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
    "https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}"
  ],
  minZoom: 1,
  maxZoom: 18,
  tileSize: 256,
  cache: 256,
  concurrency: 8
});

engine.addSource("gaode-satellite", gaodeSource);
engine.addLayer(new RasterLayer({
  id: "gaode-satellite-layer",
  source: "gaode-satellite",
  opacity: 1
}));
```

### 3.2 百度地图瓦片

```typescript
// 百度地图需要特殊处理坐标偏移
const baiduSource = new RasterTileSource("baidu", {
  tiles: [
    "https://maponline0.bdimg.com/tile/?qt=vtile&x={x}&y={y}&z={z}&styles=pl&scaler=1&udt=20230101"
  ],
  minZoom: 1,
  maxZoom: 18,
  tileSize: 256,
  cache: 256,
  concurrency: 8,
  // 百度地图坐标系特殊处理
  transform: (x, y, z) => {
    // 百度瓦片坐标转换
    return { x, y: (1 << z) - 1 - y };
  }
});
```

### 3.3 天地图瓦片

```typescript
// 天地图需要申请token
const tiandituSource = new RasterTileSource("tianditu", {
  tiles: [
    "https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=YOUR_TOKEN"
  ],
  minZoom: 1,
  maxZoom: 18,
  tileSize: 256,
  cache: 256,
  concurrency: 8
});
```

---

## 4. 图层组合

### 4.1 地形+影像叠加

```typescript
// 1. 添加地形
const terrain = new TerrainTileLayer("terrain", {
  terrain: {
    tiles: ["https://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encode: "terrarium",
    minZoom: 3,
    maxZoom: 11
  }
});
engine.addLayer(terrain);

// 2. 添加影像（叠加在地形上）
engine.addSource("satellite", new RasterTileSource("satellite", {
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  minZoom: 0,
  maxZoom: 19
}));
engine.addLayer(new RasterLayer({
  id: "satellite-layer",
  source: "satellite",
  opacity: 1
}));
```

### 4.2 多图层叠加

```typescript
// 底图
engine.addSource("base", new RasterTileSource("base", { /* ... */ }));
engine.addLayer(new RasterLayer({ id: "base-layer", source: "base", opacity: 1 }));

// 标注层（半透明叠加）
engine.addSource("labels", new RasterTileSource("labels", { /* ... */ }));
engine.addLayer(new RasterLayer({
  id: "labels-layer",
  source: "labels",
  opacity: 0.8,
  zIndex: 1  // 确保在底图之上
}));

// 边界层
engine.addSource("boundaries", new RasterTileSource("boundaries", { /* ... */ }));
engine.addLayer(new RasterLayer({
  id: "boundaries-layer",
  source: "boundaries",
  opacity: 0.5,
  zIndex: 2
}));
```

---

## 5. 交互功能

### 5.1 点击拾取

```typescript
engine.on("click", ({ pickResult }) => {
  if (!pickResult) return;
  
  switch (pickResult.type) {
    case "globe":
      // 点击地球表面
      console.log("Clicked globe at:", pickResult.cartographic);
      break;
      
    case "marker":
      // 点击标记点
      console.log("Clicked marker:", pickResult.marker);
      break;
      
    case "polyline":
      // 点击折线
      console.log("Clicked polyline:", pickResult.polyline);
      break;
      
    case "polygon":
      // 点击多边形
      console.log("Clicked polygon:", pickResult.polygon);
      break;
  }
});
```

### 5.2 视角控制

```typescript
// 设置视角
engine.setView({
  lng: 116.3975,  // 经度
  lat: 39.9085,   // 纬度
  altitude: 10000 // 高度（米）
});

// 获取当前视角
const view = engine.getView();
console.log("Current view:", view);

// 飞行到目标位置
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  altitude: 5000
}, {
  duration: 3000,  // 飞行时间（毫秒）
  easing: "easeInOutCubic"  // 缓动函数
});
```

### 5.3 鼠标事件

```typescript
// 鼠标移动
engine.on("mousemove", ({ pickResult }) => {
  if (pickResult?.type === "globe") {
    // 更新鼠标位置显示
    updateMousePosition(pickResult.cartographic);
  }
});

// 鼠标按下/释放
engine.on("mousedown", () => {
  // 开始拖拽
});

engine.on("mouseup", () => {
  // 结束拖拽
});
```

---

## 6. 图形绘制

### 6.1 添加标记点

```typescript
// 创建标记图层
const markerLayer = new MarkerLayer("markers");
engine.addLayer(markerLayer);

// 添加标记
markerLayer.addMarker({
  id: "marker-1",
  lng: 116.3975,
  lat: 39.9085,
  altitude: 0,
  color: "#ff0000",
  size: 10
});

// 更新标记
markerLayer.updateMarker("marker-1", {
  color: "#00ff00",
  size: 15
});

// 删除标记
markerLayer.removeMarker("marker-1");
```

### 6.2 绘制折线

```typescript
const polylineLayer = new PolylineLayer("polylines");
engine.addLayer(polylineLayer);

polylineLayer.addPolyline({
  id: "route-1",
  coordinates: [
    { lng: 116.3975, lat: 39.9085, altitude: 0 },
    { lng: 121.4737, lat: 31.2304, altitude: 0 },
    { lng: 113.2644, lat: 23.1291, altitude: 0 }
  ],
  color: "#0000ff",
  width: 3
});
```

### 6.3 绘制多边形

```typescript
const polygonLayer = new PolygonLayer("polygons");
engine.addLayer(polygonLayer);

polygonLayer.addPolygon({
  id: "area-1",
  coordinates: [
    { lng: 116.0, lat: 40.0, altitude: 0 },
    { lng: 117.0, lat: 40.0, altitude: 0 },
    { lng: 117.0, lat: 39.0, altitude: 0 },
    { lng: 116.0, lat: 39.0, altitude: 0 }
  ],
  fillColor: "#ff0000",
  opacity: 0.5
});
```

---

## 7. 性能优化

### 7.1 大量标记点

```typescript
// 使用实例化渲染优化大量标记
const instancedMarkerLayer = new InstancedMarkerLayer("instanced-markers");
engine.addLayer(instancedMarkerLayer);

// 批量添加标记
const markers = [];
for (let i = 0; i < 10000; i++) {
  markers.push({
    position: {
      lng: Math.random() * 360 - 180,
      lat: Math.random() * 180 - 90
    },
    color: Math.random() * 0xffffff,
    size: Math.random() * 5 + 1
  });
}

instancedMarkerLayer.addMarkers(markers);
```

### 7.2 瓦片缓存配置

```typescript
// 配置瓦片缓存
const source = new RasterTileSource("cached-source", {
  tiles: ["https://example.com/tiles/{z}/{x}/{y}.png"],
  minZoom: 0,
  maxZoom: 18,
  tileSize: 256,
  cache: 512,        // 缓存512个瓦片
  concurrency: 8,    // 最大并发数
  retry: 3,          // 重试次数
  retryDelay: 1000   // 重试延迟（毫秒）
});
```

### 7.3 按需渲染

```typescript
// 配置按需渲染
const engine = new GlobeEngine({
  container,
  renderMode: "on-demand"  // 仅在状态变化时渲染
});

// 手动触发渲染
engine.requestRender();

// 监听渲染事件
engine.on("render", () => {
  console.log("Frame rendered");
});
```

---

## 8. 错误处理

### 8.1 配置恢复策略

```typescript
const engine = new GlobeEngine({
  container,
  recoveryPolicy: {
    defaults: {
      imageryRetryAttempts: 3,
      imageryRetryDelayMs: 1000,
      imageryFallbackColor: "#1b2330"
    },
    rules: [
      {
        stage: "imagery",
        category: "network",
        severity: "warn",
        overrides: {
          imageryRetryAttempts: 2,
          imageryRetryDelayMs: 120
        }
      }
    ]
  }
});
```

### 8.2 监听错误事件

```typescript
engine.on("error", ({ layerId, stage, category, severity, error, tileKey }) => {
  console.error("Layer error:", {
    layerId,
    stage,
    category,
    severity,
    tileKey,
    error
  });
  
  // 根据严重程度处理
  if (severity === "fatal") {
    // 显示错误提示
    showErrorMessage("引擎发生致命错误");
  } else if (severity === "error") {
    // 记录错误日志
    logError(error);
  }
});
```

---

## 9. 高级功能

### 9.1 热力图

```typescript
const heatmapLayer = new HeatmapLayer("heatmap");
engine.addLayer(heatmapLayer);

// 添加热力点
heatmapLayer.addPoints([
  { lng: 116.3975, lat: 39.9085, value: 100 },
  { lng: 121.4737, lat: 31.2304, value: 80 },
  { lng: 113.2644, lat: 23.1291, value: 60 }
]);

// 配置热力图
heatmapLayer.setOptions({
  radius: 20,
  blur: 15,
  gradient: {
    0.0: 'blue',
    0.5: 'lime',
    1.0: 'red'
  }
});
```

### 9.2 聚合

```typescript
const clusterLayer = new ClusterLayer("clusters");
engine.addLayer(clusterLayer);

// 添加聚合点
clusterLayer.addPoints([
  { lng: 116.3975, lat: 39.9085 },
  { lng: 116.3980, lat: 39.9090 },
  // ... 更多点
]);

// 配置聚合
clusterLayer.setOptions({
  radius: 40,
  maxZoom: 15,
  minPoints: 2
});
```

### 9.3 自定义图层

```typescript
class CustomLayer extends Layer {
  private mesh: THREE.Mesh;
  
  constructor(id: string) {
    super(id);
    
    // 创建自定义几何体
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
  }
  
  onAdd(context: LayerContext): void {
    // 添加到场景
    context.scene.add(this.mesh);
  }
  
  onRemove(context: LayerContext): void {
    // 从场景移除
    context.scene.remove(this.mesh);
  }
  
  update(camera: THREE.PerspectiveCamera): void {
    // 更新逻辑
    this.mesh.lookAt(camera.position);
  }
}
```

---

## 10. 调试技巧

### 10.1 性能监控

```typescript
// 获取性能报告
const report = engine.getPerformanceReport();
console.log("Performance:", {
  fps: report.fps,
  frameTime: report.frameTime,
  tileCount: report.tileCount,
  memoryUsage: report.memoryUsage
});

// 重置性能报告
engine.resetPerformanceReport();
```

### 10.2 瓦片可视化

```typescript
// 开启瓦片边界可视化
engine.setDebugOptions({
  showTileBoundaries: true,
  showTileCoordinates: true,
  showFrustum: false
});
```

### 10.3 日志输出

```typescript
// 开启详细日志
engine.setLogLevel("debug");

// 监听所有事件
engine.on("*", (event, data) => {
  console.log(`Event: ${event}`, data);
});
```

---

## 11. 完整示例

### 11.1 基础地球示例

```typescript
// examples/basic-globe.ts
import {
  GlobeEngine,
  TerrainTileLayer,
  RasterTileSource,
  RasterLayer
} from "../src";

async function main() {
  // 创建引擎
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
        }
      ]
    }
  });

  // 添加地形
  const terrain = new TerrainTileLayer("terrain", {
    terrain: {
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
      ],
      encode: "terrarium",
      minZoom: 3,
      maxZoom: 11,
      tileSize: 256,
      cache: 96
    },
    meshSegments: 16,
    skirtDepthMeters: 1400
  });
  engine.addLayer(terrain);

  // 添加影像
  engine.addSource(
    "osm",
    new RasterTileSource("osm", {
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      cache: 256,
      concurrency: 8
    })
  );
  engine.addLayer(new RasterLayer({ id: "osm", source: "osm", opacity: 1 }));

  // 设置视角
  engine.setView({ lng: 110, lat: 28, altitude: 2.4 });

  // 监听事件
  engine.on("click", ({ pickResult }) => {
    if (pickResult?.type === "globe") {
      console.log(`Clicked: ${pickResult.cartographic.lng}, ${pickResult.cartographic.lat}`);
    }
  });

  engine.on("error", ({ layerId, stage, category, severity, error, tileKey }) => {
    console.error("Error:", { layerId, stage, category, severity, tileKey, error });
  });
}

main().catch(console.error);
```

---

## 12. 常见问题

### 12.1 瓦片加载失败

**问题**：瓦片显示为灰色或空白

**解决方案**：
1. 检查网络连接
2. 验证瓦片URL格式
3. 配置重试策略
4. 设置回退颜色

### 12.2 性能问题

**问题**：帧率低于30fps

**解决方案**：
1. 减少瓦片缓存数量
2. 降低瓦片分辨率
3. 使用实例化渲染
4. 开启按需渲染

### 12.3 坐标偏移

**问题**：瓦片位置不正确

**解决方案**：
1. 检查坐标系（WGS84 vs GCJ02）
2. 验证瓦片URL参数
3. 配置坐标转换

---

## 13. 验收清单

满足以下项可认为代码示例达标：

1. [ ] 示例代码可直接运行
2. [ ] 覆盖常见使用场景
3. [ ] 包含错误处理
4. [ ] 性能满足要求
5. [ ] 代码注释清晰

---

## 14. 参考源码

- `examples/basic-globe.ts` - 基础地球示例
- `examples/tile-sources-gaode-baidu.ts` - 瓦片源示例
- `README.md` - 快速开始指南

---

## 15. 下一步行动

1. 添加更多示例场景
2. 完善示例文档
3. 创建交互式示例
4. 添加性能优化示例