# 23 Public API Contract

## 1. 目标与边界

本章定义地球引擎对外暴露的接口约定：

1. 用户如何初始化引擎
2. 用户如何控制视角
3. 用户如何管理图层
4. 用户如何监听事件
5. 用户如何进行拾取查询

---

## 2. 引擎初始化

### 2.1 创建引擎

```typescript
import { GlobeEngine, GlobeEngineOptions } from '@three-map/core';

const options: GlobeEngineOptions = {
  // 必填：容器元素
  container: document.getElementById('map'),
  
  // 可选：地球半径（默认 1）
  radius: 1,
  
  // 可选：背景色（默认 '#03060d'）
  background: '#03060d',
  
  // 可选：是否显示基础地球（默认 true）
  showBaseGlobe: true,
  
  // 可选：相机初始配置
  camera: {
    fov: 60,        // 视场角（度）
    near: 0.1,      // 近裁剪面（米）
    far: 100000000  // 远裁剪面（米）
  },
  
  // 可选：恢复策略
  recoveryPolicy: {
    defaults: {
      imageryRetryAttempts: 3,
      imageryRetryDelayMs: 1000,
      imageryFallbackColor: '#1b2330'
    }
  }
};

const engine = new GlobeEngine(options);
```

### 2.2 引擎生命周期

```typescript
// 销毁引擎，释放所有资源
engine.dispose();
```

---

## 3. 视角控制

### 3.1 设置视角（支持 zoom 和 altitude）

```typescript
// 方式1：使用 altitude（精确高度，米）
engine.setView({
  lng: 116.3975,
  lat: 39.9085,
  altitude: 10000  // 高度（米）
});

// 方式2：使用 zoom（缩放级别，类似 Mapbox/Leaflet）
engine.setView({
  lng: 116.3975,
  lat: 39.9085,
  zoom: 12  // 缩放级别（0-22）
});

// 方式3：两者都传，zoom 优先
engine.setView({
  lng: 116.3975,
  lat: 39.9085,
  zoom: 12,       // 优先使用 zoom
  altitude: 10000 // 被忽略
});

// 完整参数
engine.setView({
  lng: 116.3975,
  lat: 39.9085,
  zoom: 12,        // 缩放级别（可选）
  altitude: 10000, // 高度（米，可选，与zoom二选一）
  heading: 0,      // 朝向（度，可选，正北为0）
  pitch: -45,      // 俯仰（度，可选，水平为0，向下为负）
  roll: 0          // 翻滚（度，可选）
});
```

### 3.2 Zoom 与 Altitude 转换

```typescript
// zoom 转 altitude（Web Mercator 标准）
function zoomToAltitude(zoom: number, lat: number = 0): number {
  // Web Mercator 投影下的 zoom 到地面分辨率公式
  // 地面分辨率 = 156543.03392 * cos(lat) / (2^zoom) 米/像素
  // 假设屏幕高度 1024 像素，则可见高度 = 地面分辨率 * 1024
  
  const earthCircumference = 40075016.686; // 地球周长（米）
  const tilePixels = 256;                  // 瓦片像素
  const screenHeight = 1024;               // 假设屏幕高度
  
  const metersPerPixel = (earthCircumference * Math.cos(lat * Math.PI / 180)) 
                         / (tilePixels * Math.pow(2, zoom));
  
  return metersPerPixel * screenHeight;
}

// altitude 转 zoom
function altitudeToZoom(altitude: number, lat: number = 0): number {
  const earthCircumference = 40075016.686;
  const tilePixels = 256;
  const screenHeight = 1024;
  
  const metersPerPixel = altitude / screenHeight;
  const zoom = Math.log2(
    (earthCircumference * Math.cos(lat * Math.PI / 180)) 
    / (tilePixels * metersPerPixel)
  );
  
  return Math.max(0, Math.min(22, Math.round(zoom * 100) / 100));
}

// 常用 zoom 级别对应的高度（纬度0度时）
// zoom 0  -> ~40,000 km（全球）
// zoom 5  -> ~1,200 km（大洲）
// zoom 10 -> ~40 km（城市）
// zoom 15 -> ~1 km（街道）
// zoom 18 -> ~150 m（建筑物）
// zoom 20 -> ~40 m（细节）
```

### 3.3 内部实现

```typescript
// EngineView 接口定义
interface EngineView {
  lng: number;
  lat: number;
  zoom?: number;      // 缩放级别（可选）
  altitude?: number;  // 高度（米，可选）
  heading?: number;
  pitch?: number;
  roll?: number;
}

// setView 内部实现
class GlobeEngine {
  setView(view: EngineView): void {
    let altitude: number;
    
    if (view.zoom !== undefined) {
      // 优先使用 zoom
      altitude = this.zoomToAltitude(view.zoom, view.lat);
    } else if (view.altitude !== undefined) {
      // 使用 altitude
      altitude = view.altitude;
    } else {
      // 默认值
      altitude = this.cameraController.getAltitude();
    }
    
    this.cameraController.setView({
      lng: view.lng,
      lat: view.lat,
      altitude,
      heading: view.heading ?? this.cameraController.getHeading(),
      pitch: view.pitch ?? this.cameraController.getPitch(),
      roll: view.roll ?? this.cameraController.getRoll()
    });
  }
  
  private zoomToAltitude(zoom: number, lat: number): number {
    const earthCircumference = 40075016.686;
    const metersPerPixel = (earthCircumference * Math.cos(lat * Math.PI / 180)) 
                           / (256 * Math.pow(2, zoom));
    return metersPerPixel * 1024;
  }
}
```

### 3.4 getView 返回值

```typescript
const view = engine.getView();
// 返回:
// {
//   lng: number,
//   lat: number,
//   altitude: number,  // 始终返回 altitude
//   zoom: number,      // 额外返回 zoom（由 altitude 计算）
//   heading: number,
//   pitch: number,
//   roll: number
// }
```

### 3.5 Zoom 与 Scale 的关系

```typescript
// 不同 zoom 级别的视觉效果
// zoom 0:  看到整个地球
// zoom 3:  看到一个大洲
// zoom 5:  看到一个国家
// zoom 10: 看到一个城市
// zoom 15: 看到一个街区
// zoom 18: 看到一栋建筑
// zoom 20: 看到建筑细节
// zoom 22: 最大缩放（约 1:1000 比例尺）

// 与 Mapbox/Leaflet 的 zoom 对齐
// Mapbox zoom 0  -> altitude ~40,075 km
// Mapbox zoom 10 -> altitude ~40 km
// Mapbox zoom 15 -> altitude ~1.2 km
// Mapbox zoom 20 -> altitude ~40 m
```

### 3.6 飞行到目标位置（支持 zoom + Promise 回调）

```typescript
// 方式1：使用 altitude
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  altitude: 5000
}, {
  duration: 3000
});

// 方式2：使用 zoom（推荐）
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  zoom: 15
}, {
  duration: 3000
});

// 方式3：Promise 回调
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  zoom: 15
}, {
  duration: 3000
}).then((result) => {
  console.log('成功到达目的地');
}).catch((result) => {
  console.log('飞行被打断:', result.reason);
});

// 方式4：async/await
try {
  const result = await engine.flyTo({ lng: 121.4737, lat: 31.2304, zoom: 15 });
  console.log('成功到达目的地');
} catch (result) {
  console.log('飞行被打断:', result.reason);
}
```

### 3.7 flyTo 返回值

```typescript
interface FlyToResult {
  success: boolean;
  reason?: 'user-interaction' | 'new-flyto' | 'cancelled';
}

// 成功：到达目的地
{ success: true }

// 失败：被打断
{ success: false, reason: 'user-interaction' }  // 用户拖拽/缩放
{ success: false, reason: 'new-flyto' }         // 再次调用 flyTo
{ success: false, reason: 'cancelled' }         // 手动取消
```

### 3.8 flyTo 打断场景

```typescript
// 以下操作会打断当前飞行：
// 1. 用户拖拽
// 2. 用户缩放
// 3. 用户旋转
// 4. 再次调用 flyTo
// 5. 调用 setView
// 6. 调用 cancelFlyTo()

// 示例：用户交互打断
const flight = engine.flyTo({ lng: 121.4737, lat: 31.2304, zoom: 15 }, { duration: 5000 });

flight.catch((result) => {
  if (result.reason === 'user-interaction') {
    console.log('用户取消了飞行');
  }
});

// 示例：再次 flyTo 打断
engine.flyTo({ lng: 116, lat: 39, zoom: 10 }); // 打断之前的飞行
engine.flyTo({ lng: 121, lat: 31, zoom: 15 }); // 打断上面的飞行

// 示例：手动取消
const flight = engine.flyTo({ lng: 121.4737, lat: 31.2304, zoom: 15 }, { duration: 5000 });
engine.cancelFlyTo(); // 立即取消
```

### 3.9 flyTo 内部实现

```typescript
class GlobeEngine {
  private currentFlyTo: {
    resolve: (result: FlyToResult) => void;
    reject: (result: FlyToResult) => void;
    animation: FlyToAnimation;
  } | null = null;

  flyTo(
    target: EngineView,
    options: FlyToOptions = {}
  ): Promise<FlyToResult> {
    // 1. 如果有正在进行的飞行，打断它
    if (this.currentFlyTo) {
      this.currentFlyTo.reject({ success: false, reason: 'new-flyto' });
      this.currentFlyTo = null;
    }

    // 2. 处理 zoom 参数
    const resolvedTarget = this.resolveView(target);

    // 3. 创建 Promise
    return new Promise<FlyToResult>((resolve, reject) => {
      // 4. 创建飞行动画
      const animation = new FlyToAnimation(
        this.camera,
        resolvedTarget,
        options.duration ?? 3000,
        options.easing ?? easeInOutCubic,
        options.maxAltitude
      );

      // 5. 保存当前飞行
      this.currentFlyTo = { resolve, reject, animation };

      // 6. 监听用户交互
      const onUserInteraction = () => {
        if (this.currentFlyTo) {
          this.currentFlyTo.reject({ success: false, reason: 'user-interaction' });
          this.currentFlyTo = null;
        }
      };

      this.on('dragstart', onUserInteraction);
      this.on('zoomstart', onUserInteraction);

      // 7. 开始动画
      this.startAnimation(animation, () => {
        // 动画完成
        this.off('dragstart', onUserInteraction);
        this.off('zoomstart', onUserInteraction);

        if (this.currentFlyTo) {
          this.currentFlyTo.resolve({ success: true });
          this.currentFlyTo = null;
        }
      });
    });
  }

  cancelFlyTo(): void {
    if (this.currentFlyTo) {
      this.currentFlyTo.reject({ success: false, reason: 'cancelled' });
      this.currentFlyTo = null;
    }
  }

  private resolveView(view: EngineView): ResolvedView {
    let altitude: number;

    if (view.zoom !== undefined) {
      altitude = this.zoomToAltitude(view.zoom, view.lat);
    } else if (view.altitude !== undefined) {
      altitude = view.altitude;
    } else {
      altitude = this.cameraController.getAltitude();
    }

    return {
      lng: view.lng,
      lat: view.lat,
      altitude,
      heading: view.heading ?? this.cameraController.getHeading(),
      pitch: view.pitch ?? this.cameraController.getPitch(),
      roll: view.roll ?? this.cameraController.getRoll()
    };
  }
}
```

### 3.10 flyTo 高级选项

```typescript
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  zoom: 15,
  heading: 0,      // 到达后的朝向（可选）
  pitch: -45       // 到达后的俯仰（可选）
}, {
  duration: 5000,
  easing: 'easeInOutCubic',
  maxAltitude: 1000000,  // 飞行过程中的最大高度（可选）
  minAltitude: 1000      // 飞行过程中的最小高度（可选）
});
```

### 3.11 与 Mapbox flyTo 的兼容性

```typescript
// Mapbox GL JS
map.flyTo({
  center: [121.4737, 31.2304],
  zoom: 15,
  duration: 3000
});

// three-map（等价）
engine.flyTo({
  lng: 121.4737,
  lat: 31.2304,
  zoom: 15
}, {
  duration: 3000
});
```

---

## 4. 数据源管理

### 4.1 添加栅格数据源

```typescript
import { RasterTileSource } from '@three-map/core';

// 基础用法
engine.addSource('osm', new RasterTileSource('osm', {
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  minZoom: 0,
  maxZoom: 19,
  tileSize: 256,
  cache: 256,
  concurrency: 8
}));

// 高级用法：请求链接加工（签名、加密、Token等）
engine.addSource('gaode', new RasterTileSource('gaode', {
  tiles: ['https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'],
  
  // 请求加工函数
  transformRequest: (url: string, resourceType: string) => {
    // 示例1：添加 Token
    const token = getAccessToken();
    const separator = url.includes('?') ? '&' : '?';
    return { url: `${url}${separator}token=${token}` };
    
    // 示例2：添加签名
    // const signature = sign(url);
    // return { url: `${url}&sign=${signature}` };
    
    // 示例3：代理转发
    // return { url: `https://proxy.example.com?url=${encodeURIComponent(url)}` };
    
    // 示例4：加密
    // const encrypted = encrypt(url);
    // return { url: `https://api.example.com/tiles?data=${encrypted}` };
  }
}));
```

#### transformRequest 完整接口

```typescript
interface TransformRequestCallback {
  (url: string, resourceType: ResourceType): TransformRequestResult;
}

type ResourceType = 'Tile' | 'Glyphs' | 'SpriteImage' | 'SpriteJSON' | 'GeoJSON';

interface TransformRequestResult {
  url: string;
  headers?: Record<string, string>;
  credentials?: 'same-origin' | 'include' | 'omit';
  method?: 'GET' | 'POST';
}

// RasterTileSource 配置
interface RasterTileSourceOptions {
  tiles: string[];
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  cache?: number;
  concurrency?: number;
  transformRequest?: TransformRequestCallback;  // 请求加工
}
```

#### 使用场景

```typescript
// 场景1：添加动态 Token
const source = new RasterTileSource('secure', {
  tiles: ['https://api.example.com/tiles/{z}/{x}/{y}'],
  transformRequest: (url) => ({
    url: `${url}?token=${getDynamicToken()}`,
    headers: { 'Authorization': `Bearer ${getToken()}` }
  })
});

// 场景2：请求签名
const source = new RasterTileSource('signed', {
  tiles: ['https://api.example.com/tiles/{z}/{x}/{y}'],
  transformRequest: (url) => {
    const timestamp = Date.now();
    const signature = generateSignature(url, timestamp);
    return {
      url: `${url}?ts=${timestamp}&sign=${signature}`
    };
  }
});

// 场景3：代理转发（解决跨域）
const source = new RasterTileSource('proxied', {
  tiles: ['https://internal-api.example.com/tiles/{z}/{x}/{y}'],
  transformRequest: (url) => ({
    url: `https://proxy.example.com/fetch?url=${encodeURIComponent(url)}`
  })
});

// 场景4：请求加密
const source = new RasterTileSource('encrypted', {
  tiles: ['https://secure-api.example.com/tiles/{z}/{x}/{y}'],
  transformRequest: (url) => {
    const encrypted = encryptUrl(url, secretKey);
    return {
      url: `https://secure-api.example.com/decrypt?data=${encrypted}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
  }
});

// 场景5：防盗链
const source = new RasterTileSource('anti-hotlink', {
  tiles: ['https://tile.example.com/{z}/{x}/{y}.png'],
  transformRequest: (url) => ({
    url,
    headers: {
      'Referer': 'https://my-app.example.com',
      'Origin': 'https://my-app.example.com'
    }
  })
});
```

### 4.2 添加地形数据源

```typescript
import { TerrainTileSource } from '@three-map/core';

// 添加地形源
engine.addSource('terrain', new TerrainTileSource('terrain', {
  tiles: ['https://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  minZoom: 3,
  maxZoom: 12,
  tileSize: 256
}));
```

### 4.3 获取/移除数据源

```typescript
// 获取数据源
const source = engine.getSource('osm');

// 移除数据源
engine.removeSource('osm');
```

### 4.4 中国互联网地图坐标系支持

#### 坐标系概述

| 坐标系 | 使用方 | 特点 | 偏移量 |
|--------|--------|------|--------|
| **WGS-84** | GPS、OSM、天地图 | 国际标准，**引擎基准** | 0m |
| **CGCS2000** | 天地图 | 国家标准，与WGS-84兼容 | < 0.1m |
| **GCJ-02** | 高德、腾讯 | 火星坐标系，加密偏移 | 100-500m |
| **BD-09** | 百度 | 在GCJ-02基础上二次加密 | 200-600m |

#### 架构原则：影像纠偏到 WGS-84

**正确架构**：
```
地形网格（WGS-84）→ 引擎基准坐标系
  ↓
所有数据源都对齐到 WGS-84
  ↓
- WGS-84 数据源：不需要转换（GeoJSON、GPS轨迹、OSM等）
- GCJ-02 影像：纠偏到 WGS-84（高德、腾讯）
- BD-09 影像：纠偏到 WGS-84（百度）
```

**错误架构**（不要这样做）：
```
地形网格（WGS-84 → GCJ-02）→ 转换到 GCJ-02
  ↓
问题：WGS-84 数据源（GeoJSON、GPS轨迹）会有偏移！
```

#### 坐标系转换函数

```typescript
import {
  wgs84ToGcj02,   // WGS84 -> 高德/腾讯
  gcj02ToWgs84,   // 高德/腾讯 -> WGS84（纠偏用）
  wgs84ToBd09,    // WGS84 -> 百度
  bd09ToWgs84,    // 百度 -> WGS84（纠偏用）
  gcj02ToBd09,    // 高德 -> 百度
  bd09ToGcj02     // 百度 -> 高德
} from '@three-map/core';
```

#### 高德瓦片源（纠偏到 WGS-84）

```typescript
import { RasterTileSource, RasterLayer, gcj02ToWgs84 } from '@three-map/core';

// 高德 URL（GCJ-02 坐标系瓦片）
const GAODE_URLS = {
  road: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
  satellite: 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
  labels: 'https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
};

// 添加高德卫星源
engine.addSource('gaode-satellite', new RasterTileSource('gaode-satellite', {
  tiles: [GAODE_URLS.satellite],
  tileSize: 256,
  minZoom: 3,
  maxZoom: 18,
  cache: 128
}));

// 影像图层：纠偏到 WGS-84（关键！）
const gaodeLayer = new RasterLayer({
  id: 'gaode-satellite',
  source: 'gaode-satellite',
  coordTransform: (lng, lat) => gcj02ToWgs84({ lng, lat })  // 影像纠偏到 WGS-84
});

// 地形图层：保持 WGS-84（不需要转换）
const terrainLayer = new TerrainTileLayer('terrain', {
  source: 'terrain'
  // 不需要 coordTransform
});
```

#### 百度瓦片源（纠偏到 WGS-84）

```typescript
import { RasterTileSource, RasterLayer, bd09ToWgs84 } from '@three-map/core';

// 百度 URL（BD-09 坐标系瓦片）
const BAIDU_URLS = {
  satellite: 'https://shangetu0.map.bdimg.com/it/u=x={x};y={y};z={z};v=009;type=sate&fm=46',
  road: 'https://online0.map.bdimg.com/onlinelabel/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1&p=1'
};

// 添加百度卫星源
engine.addSource('baidu-satellite', new RasterTileSource('baidu-satellite', {
  tiles: [BAIDU_URLS.satellite],
  tileSize: 256,
  minZoom: 3,
  maxZoom: 18
}));

// 影像图层：纠偏到 WGS-84（关键！）
const baiduLayer = new RasterLayer({
  id: 'baidu-satellite',
  source: 'baidu-satellite',
  coordTransform: (lng, lat) => bd09ToWgs84({ lng, lat })  // 影像纠偏到 WGS-84
});
```

#### 天地图瓦片源（不需要纠偏）

```typescript
import { RasterTileSource } from '@three-map/core';

// 天地图 URL（CGCS2000/WGS-84 坐标系）
const TIANDITU_URLS = {
  img: 'https://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=YOUR_TOKEN'
};

// 天地图不需要坐标转换（CGCS2000 ≈ WGS-84）
engine.addSource('tianditu', new RasterTileSource('tianditu', {
  tiles: [TIANDITU_URLS.img],
  tileSize: 256,
  minZoom: 1,
  maxZoom: 18
}));

const tiandituLayer = new RasterLayer({
  id: 'tianditu',
  source: 'tianditu'
  // 不需要 coordTransform
});
```

#### 完整示例：混合数据源

```typescript
import {
  GlobeEngine,
  RasterTileSource,
  TerrainTileSource,
  TerrainTileLayer,
  RasterLayer,
  GeoJSONSource,
  VectorLayer,
  gcj02ToWgs84,
  bd09ToWgs84
} from '@three-map/core';

const engine = new GlobeEngine({ container: document.getElementById('map') });

// 1. 地形（WGS-84 基准）
engine.addSource('terrain', new TerrainTileSource('terrain', {
  tiles: ['https://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encode: 'terrarium'
}));
engine.addLayer(new TerrainTileLayer('terrain-layer', {
  source: 'terrain'
  // 不需要 coordTransform，保持 WGS-84
}));

// 2. 高德影像（GCJ-02 → WGS-84 纠偏）
engine.addSource('gaode', new RasterTileSource('gaode', {
  tiles: ['https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}']
}));
engine.addLayer(new RasterLayer({
  id: 'gaode-layer',
  source: 'gaode',
  coordTransform: (lng, lat) => gcj02ToWgs84({ lng, lat })  // 关键：纠偏到 WGS-84
}));

// 3. GeoJSON 数据源（WGS-84，不需要转换）
engine.addSource('markers', new GeoJSONSource({
  data: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.3975, 39.9085] },
      properties: { name: 'Beijing' }
    }]
  }
}));
engine.addLayer(new VectorLayer({
  id: 'markers-layer',
  source: 'markers'
  // 不需要 coordTransform，数据已经是 WGS-84
}));

// 4. GPS 轨迹（WGS-84，直接叠加）
const gpsTrack = [
  [116.3975, 39.9085],
  [116.4000, 39.9100],
  [116.4025, 39.9115]
];
// 直接使用，不需要转换

engine.setView({ lng: 116.3975, lat: 39.9085, zoom: 12 });
```

#### 注意事项

1. **架构原则**：保持地形网格为 WGS-84 基准，所有数据源都对齐到 WGS-84
2. **影像纠偏**：高德/百度影像需要纠偏到 WGS-84，而不是反过来
3. **数据源兼容**：这样 GeoJSON、GPS轨迹等 WGS-84 数据源可以直接使用
4. **国内限制**：GCJ-02/BD-09 纠偏只在中国境内有效

### 4.5 投影系统支持（EPSG:4326 vs EPSG:3857）

#### 投影概述

| 投影 | EPSG | 瓦片形状 | 使用方 |
|------|------|----------|--------|
| **Web墨卡托** | 3857 | 正方形 | OSM、高德、百度、天地图 |
| **WGS-84地理** | 4326 | 矩形 | 部分天地图、WMS服务 |

#### 问题：4326底图需要适配3857

```
Web墨卡托（3857）：瓦片是正方形，纬度越高，经度跨度越大
WGS-84（4326）：瓦片是矩形，纬度越高，经度跨度越小

如果直接渲染4326瓦片，会与3857瓦片不匹配
```

#### 解决方案：4326底图适配3857

```typescript
// 4326 底图需要投影变换，适配到 3857 坐标系
const projectionTransform = (lng: number, lat: number) => {
  // Web墨卡托投影公式
  const x = lng * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  const y = y * 20037508.34 / 180;
  return { x, y };
};

// 4326 底图图层
const layer4326 = new RasterLayer({
  id: 'wms-4326',
  source: 'wms-source',
  projection: 'EPSG:4326',  // 声明投影
  coordTransform: projectionTransform  // 投影变换
});
```

#### 完整示例：混合投影支持

```typescript
import {
  GlobeEngine,
  RasterTileSource,
  RasterLayer,
  gcj02ToWgs84,
  bd09ToWgs84
} from '@three-map/core';

const engine = new GlobeEngine({ container: document.getElementById('map') });

// 1. 高德底图（GCJ-02 + Web墨卡托）
engine.addSource('gaode', new RasterTileSource('gaode', {
  tiles: ['https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}']
}));
engine.addLayer(new RasterLayer({
  id: 'gaode-layer',
  source: 'gaode',
  coordTransform: (lng, lat) => gcj02ToWgs84({ lng, lat })  // 坐标系纠偏
}));

// 2. 天地图底图（WGS-84 + Web墨卡托）
engine.addSource('tianditu', new RasterTileSource('tianditu', {
  tiles: ['https://t0.tianditu.gov.cn/img_w/wmts?...']
}));
engine.addLayer(new RasterLayer({
  id: 'tianditu-layer',
  source: 'tianditu'
  // 不需要转换，WGS-84 + Web墨卡托
}));

// 3. WMS底图（WGS-84 + EPSG:4326投影）
engine.addSource('wms', new RasterTileSource('wms', {
  tiles: ['https://example.com/wms?bbox={bbox}&...']
}));
engine.addLayer(new RasterLayer({
  id: 'wms-layer',
  source: 'wms',
  projection: 'EPSG:4326',  // 声明4326投影
  coordTransform: (lng, lat) => {
    // Web墨卡托投影变换
    const x = lng * 20037508.34 / 180;
    const mercN = Math.log(Math.tan((90 + lat) * Math.PI / 360));
    const y = mercN * 20037508.34 / Math.PI;
    return { lng: x, lat: y };
  }
}));

engine.setView({ lng: 116.3975, lat: 39.9085, zoom: 12 });
```

#### 坐标系与投影组合

| 数据源 | 坐标系 | 投影 | 转换方式 |
|--------|--------|------|----------|
| OSM | WGS-84 | 3857 | 不需要 |
| 高德 | GCJ-02 | 3857 | `gcj02ToWgs84` |
| 百度 | BD-09 | 自定义 | `bd09ToWgs84` |
| 天地图 | WGS-84 | 3857 | 不需要 |
| WMS 4326 | WGS-84 | 4326 | 投影变换 |
| GeoJSON | WGS-84 | 无 | 不需要 |
| GPS轨迹 | WGS-84 | 无 | 不需要 |

---

## 5. 图层管理

### 5.1 添加栅格图层

```typescript
import { RasterLayer } from '@three-map/core';

engine.addLayer(new RasterLayer({
  id: 'osm-layer',
  source: 'osm',
  opacity: 1,
  visible: true
}));
```

### 5.2 添加地形图层

```typescript
import { TerrainTileLayer } from '@three-map/core';

engine.addLayer(new TerrainTileLayer('terrain-layer', {
  source: 'terrain',
  meshSegments: 16,
  skirtDepthMeters: 1400
}));
```

### 5.3 添加标记图层（支持贴地 + 相对高度）

```typescript
import { MarkerLayer } from '@three-map/core';

const markerLayer = new MarkerLayer('markers');
engine.addLayer(markerLayer);

// 方式1：贴地（默认，不传 altitude）
markerLayer.addMarker({
  id: 'marker-1',
  lng: 116.3975,
  lat: 39.9085,
  // altitude 不传 = 贴地
  color: '#ff0000',
  size: 10
});

// 方式2：绝对高度（传 altitude）
markerLayer.addMarker({
  id: 'marker-2',
  lng: 116.3975,
  lat: 39.9085,
  altitude: 100,  // 绝对高度 100 米
  color: '#00ff00',
  size: 10
});

// 方式3：相对高度（贴地 + 偏移）
markerLayer.addMarker({
  id: 'marker-3',
  lng: 116.3975,
  lat: 39.9085,
  altitude: 0,        // 基准高度（会被忽略）
  offset: 50,         // 相对地面的高度 50 米
  color: '#0000ff',
  size: 10
});

// 方式4：显式指定贴地
markerLayer.addMarker({
  id: 'marker-4',
  lng: 116.3975,
  lat: 39.9085,
  clampToGround: true,  // 显式贴地
  offset: 10,           // 贴地 + 10 米偏移
  color: '#ffff00',
  size: 10
});

// 更新标记
markerLayer.updateMarker('marker-1', {
  color: '#00ff00'
});

// 移除标记
markerLayer.removeMarker('marker-1');
```

### 5.4 添加折线图层（支持贴地 + 相对高度）

```typescript
import { PolylineLayer } from '@three-map/core';

const polylineLayer = new PolylineLayer('polylines');
engine.addLayer(polylineLayer);

// 方式1：贴地折线（默认，不传 altitude）
polylineLayer.addPolyline({
  id: 'route-1',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },      // 贴地
    { lng: 121.4737, lat: 31.2304 }       // 贴地
  ],
  color: '#0000ff',
  width: 3
});

// 方式2：绝对高度折线
polylineLayer.addPolyline({
  id: 'route-2',
  coordinates: [
    { lng: 116.3975, lat: 39.9085, altitude: 100 },  // 100 米高度
    { lng: 121.4737, lat: 31.2304, altitude: 100 }   // 100 米高度
  ],
  color: '#00ff00',
  width: 3
});

// 方式3：相对高度折线（贴地 + 偏移）
polylineLayer.addPolyline({
  id: 'route-3',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },
    { lng: 121.4737, lat: 31.2304 }
  ],
  clampToGround: true,  // 贴地
  offset: 50,           // 贴地 + 50 米偏移
  color: '#ff0000',
  width: 3
});

// 方式4：混合高度（每个点可以不同）
polylineLayer.addPolyline({
  id: 'route-4',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },                        // 贴地
    { lng: 118.0, lat: 36.0, altitude: 500 },               // 绝对高度 500 米
    { lng: 121.4737, lat: 31.2304, offset: 100 }            // 贴地 + 100 米
  ],
  color: '#ff00ff',
  width: 3
});
```

### 5.5 添加多边形图层（支持贴地 + 相对高度）

```typescript
import { PolygonLayer } from '@three-map/core';

const polygonLayer = new PolygonLayer('polygons');
engine.addLayer(polygonLayer);

// 方式1：贴地多边形（默认，不传 altitude）
polygonLayer.addPolygon({
  id: 'area-1',
  coordinates: [
    { lng: 116.0, lat: 40.0 },  // 贴地
    { lng: 117.0, lat: 40.0 },
    { lng: 117.0, lat: 39.0 },
    { lng: 116.0, lat: 39.0 }
  ],
  fillColor: '#ff0000',
  fillOpacity: 0.5
});

// 方式2：绝对高度多边形
polygonLayer.addPolygon({
  id: 'area-2',
  coordinates: [
    { lng: 116.0, lat: 40.0, altitude: 100 },
    { lng: 117.0, lat: 40.0, altitude: 100 },
    { lng: 117.0, lat: 39.0, altitude: 100 },
    { lng: 116.0, lat: 39.0, altitude: 100 }
  ],
  fillColor: '#00ff00',
  fillOpacity: 0.5
});

// 方式3：相对高度多边形（贴地 + 偏移）
polygonLayer.addPolygon({
  id: 'area-3',
  coordinates: [
    { lng: 116.0, lat: 40.0 },
    { lng: 117.0, lat: 40.0 },
    { lng: 117.0, lat: 39.0 },
    { lng: 116.0, lat: 39.0 }
  ],
  clampToGround: true,  // 贴地
  offset: 50,           // 贴地 + 50 米偏移
  fillColor: '#0000ff',
  fillOpacity: 0.5
});

// 方式4：拉伸多边形（3D 建筑效果）
polygonLayer.addPolygon({
  id: 'building-1',
  coordinates: [
    { lng: 116.0, lat: 40.0 },
    { lng: 117.0, lat: 40.0 },
    { lng: 117.0, lat: 39.0 },
    { lng: 116.0, lat: 39.0 }
  ],
  clampToGround: true,   // 底部贴地
  extrusion: {
    enabled: true,
    height: 100          // 拉伸高度 100 米
  },
  fillColor: '#888888'
});
```

### 5.6 坐标高度类型定义

```typescript
// 坐标定义
interface Coordinate {
  lng: number;
  lat: number;
  altitude?: number;  // 可选：绝对高度（米）
  offset?: number;    // 可选：相对高度偏移（米）
}

// 贴地配置
interface GroundClampingOptions {
  clampToGround?: boolean;  // 是否贴地（默认 altitude 未传时为 true）
  offset?: number;          // 贴地时的偏移高度（米）
}

// 标记定义
interface MarkerDefinition extends GroundClampingOptions {
  id: string;
  lng: number;
  lat: number;
  altitude?: number;
  color?: string;
  size?: number;
}

// 折线定义
interface PolylineDefinition extends GroundClampingOptions {
  id: string;
  coordinates: Coordinate[];
  color?: string;
  width?: number;
}

// 多边形定义
interface PolygonDefinition extends GroundClampingOptions {
  id: string;
  coordinates: Coordinate[];
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  extrusion?: {
    enabled: boolean;
    height: number;
  };
}
```

### 5.7 高度计算逻辑

```typescript
// 内部高度解析逻辑
function resolveHeight(coordinate: Coordinate, terrainProvider: TerrainProvider): number {
  // 情况1：有绝对高度
  if (coordinate.altitude !== undefined && coordinate.offset === undefined) {
    return coordinate.altitude;
  }
  
  // 情况2：有相对高度（贴地 + 偏移）
  if (coordinate.offset !== undefined) {
    const groundHeight = await terrainProvider.getHeight(coordinate.lng, coordinate.lat);
    return groundHeight + coordinate.offset;
  }
  
  // 情况3：无高度（贴地）
  return await terrainProvider.getHeight(coordinate.lng, coordinate.lat);
}

// 折线高度解析
async function resolvePolylineHeights(
  definition: PolylineDefinition,
  terrainProvider: TerrainProvider
): Promise<number[]> {
  const heights: number[] = [];
  
  for (const coord of definition.coordinates) {
    if (definition.clampToGround || coord.altitude === undefined) {
      // 贴地
      const groundHeight = await terrainProvider.getHeight(coord.lng, coord.lat);
      heights.push(groundHeight + (coord.offset ?? definition.offset ?? 0));
    } else {
      // 绝对高度
      heights.push(coord.altitude + (coord.offset ?? 0));
    }
  }
  
  return heights;
}
```

### 5.8 渐变线（Gradient Polyline）

渐变线常用于道路拥堵、爬升高度、方向等场景。

```typescript
import { GradientPolylineLayer } from '@three-map/core';

const gradientLayer = new GradientPolylineLayer('gradient-polylines');
engine.addLayer(gradientLayer);
```

#### 场景1：道路拥堵（红黄绿渐变）

```typescript
// 方式1：预定义颜色渐变
gradientLayer.addPolyline({
  id: 'road-congestion',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },
    { lng: 117.0, lat: 38.5 },
    { lng: 118.0, lat: 37.0 },
    { lng: 119.0, lat: 35.5 },
    { lng: 120.0, lat: 34.0 },
    { lng: 121.4737, lat: 31.2304 }
  ],
  clampToGround: true,
  width: 8,
  
  // 渐变配置
  gradient: {
    // 渐变类型：'segment'（按段）或 'continuous'（连续）
    type: 'segment',
    
    // 每段的颜色
    colors: [
      '#00ff00',  // 绿色 - 畅通
      '#ffff00',  // 黄色 - 缓慢
      '#ff8800',  // 橙色 - 拥挤
      '#ff0000'   // 红色 - 堵塞
    ]
  }
});

// 方式2：每段指定颜色
gradientLayer.addPolyline({
  id: 'road-congestion-2',
  coordinates: [
    { lng: 116.3975, lat: 39.9085, color: '#00ff00' },
    { lng: 117.0, lat: 38.5, color: '#00ff00' },
    { lng: 118.0, lat: 37.0, color: '#ffff00' },
    { lng: 119.0, lat: 35.5, color: '#ff8800' },
    { lng: 120.0, lat: 34.0, color: '#ff0000' },
    { lng: 121.4737, lat: 31.2304, color: '#ff0000' }
  ],
  clampToGround: true,
  width: 8
});

// 方式3：使用速度值自动映射颜色
gradientLayer.addPolyline({
  id: 'road-speed',
  coordinates: [
    { lng: 116.3975, lat: 39.9085, value: 60 },  // 60 km/h
    { lng: 117.0, lat: 38.5, value: 40 },         // 40 km/h
    { lng: 118.0, lat: 37.0, value: 20 },         // 20 km/h
    { lng: 119.0, lat: 35.5, value: 10 },         // 10 km/h
    { lng: 120.0, lat: 34.0, value: 5 },          // 5 km/h
    { lng: 121.4737, lat: 31.2304, value: 0 }     // 0 km/h
  ],
  clampToGround: true,
  width: 8,
  
  // 值到颜色的映射
  valueMapping: {
    min: 0,
    max: 60,
    colors: ['#ff0000', '#ffff00', '#00ff00']  // 红黄绿（从低到高）
  }
});
```

#### 场景2：爬升高度（高度渐变）

```typescript
gradientLayer.addPolyline({
  id: 'elevation-profile',
  coordinates: [
    { lng: 116.3975, lat: 39.9085, altitude: 50 },   // 海拔 50m
    { lng: 117.0, lat: 38.5, altitude: 200 },         // 海拔 200m
    { lng: 118.0, lat: 37.0, altitude: 500 },         // 海拔 500m
    { lng: 119.0, lat: 35.5, altitude: 300 },         // 海拔 300m
    { lng: 120.0, lat: 34.0, altitude: 800 },         // 海拔 800m
    { lng: 121.4737, lat: 31.2304, altitude: 100 }    // 海拔 100m
  ],
  width: 6,
  
  // 高度到颜色的映射
  elevationMapping: {
    min: 0,
    max: 1000,
    colors: ['#00ff00', '#ffff00', '#ff0000']  // 绿色低 -> 黄色中 -> 红色高
  }
});

// 方式2：使用 3D 效果展示爬升
gradientLayer.addPolyline({
  id: 'elevation-3d',
  coordinates: [
    { lng: 116.3975, lat: 39.9085, altitude: 50 },
    { lng: 117.0, lat: 38.5, altitude: 200 },
    { lng: 118.0, lat: 37.0, altitude: 500 },
    { lng: 119.0, lat: 35.5, altitude: 300 },
    { lng: 120.0, lat: 34.0, altitude: 800 },
    { lng: 121.4737, lat: 31.2304, altitude: 100 }
  ],
  width: 4,
  
  // 高度渐变
  elevationMapping: {
    min: 0,
    max: 1000,
    colors: ['#00ff00', '#ffff00', '#ff0000']
  },
  
  // 3D 效果
  extrusion: {
    enabled: true,
    color: '#0066ff',
    opacity: 0.3
  }
});
```

#### 场景3：方向信息（方向渐变）

```typescript
gradientLayer.addPolyline({
  id: 'direction-gradient',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },
    { lng: 117.0, lat: 38.5 },
    { lng: 118.0, lat: 37.0 },
    { lng: 119.0, lat: 35.5 },
    { lng: 120.0, lat: 34.0 },
    { lng: 121.4737, lat: 31.2304 }
  ],
  clampToGround: true,
  width: 6,
  
  // 方向渐变（根据航向角变化）
  headingMapping: {
    colors: ['#ff0000', '#ff8800', '#ffff00', '#88ff00', '#00ff00'],
    mode: 'heading'  // 根据航向角映射颜色
  }
});

// 方式2：箭头方向指示
gradientLayer.addPolyline({
  id: 'arrow-direction',
  coordinates: [
    { lng: 116.3975, lat: 39.9085 },
    { lng: 117.0, lat: 38.5 },
    { lng: 118.0, lat: 37.0 },
    { lng: 119.0, lat: 35.5 },
    { lng: 120.0, lat: 34.0 },
    { lng: 121.4737, lat: 31.2304 }
  ],
  clampToGround: true,
  width: 4,
  
  // 箭头样式
  arrow: {
    enabled: true,
    size: 20,
    spacing: 1000,  // 每 1000 米一个箭头
    color: '#ffffff'
  }
});
```

#### 渐变线配置完整接口

```typescript
interface GradientPolylineDefinition extends GroundClampingOptions {
  id: string;
  coordinates: GradientCoordinate[];
  width?: number;
  
  // 渐变配置
  gradient?: {
    type: 'segment' | 'continuous';
    colors: string[];
  };
  
  // 值映射
  valueMapping?: {
    min: number;
    max: number;
    colors: string[];
  };
  
  // 高度映射
  elevationMapping?: {
    min: number;
    max: number;
    colors: string[];
  };
  
  // 方向映射
  headingMapping?: {
    colors: string[];
    mode: 'heading';
  };
  
  // 箭头
  arrow?: {
    enabled: boolean;
    size: number;
    spacing: number;
    color: string;
  };
  
  // 3D 拉伸
  extrusion?: {
    enabled: boolean;
    color: string;
    opacity: number;
  };
}

interface GradientCoordinate {
  lng: number;
  lat: number;
  altitude?: number;
  offset?: number;
  color?: string;   // 该点的颜色
  value?: number;   // 该点的值（用于值映射）
}
```

#### 渐变线颜色映射算法

```typescript
function mapValueToColor(
  value: number,
  min: number,
  max: number,
  colors: string[]
): string {
  // 归一化
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  
  // 计算颜色索引
  const index = t * (colors.length - 1);
  const i = Math.floor(index);
  const f = index - i;
  
  // 如果是整数，直接返回
  if (f === 0) {
    return colors[i];
  }
  
  // 线性插值
  const color1 = hexToRgb(colors[i]);
  const color2 = hexToRgb(colors[i + 1]);
  
  const r = Math.round(color1.r + (color2.r - color1.r) * f);
  const g = Math.round(color1.g + (color2.g - color1.g) * f);
  const b = Math.round(color1.b + (color2.b - color1.b) * f);
  
  return rgbToHex(r, g, b);
}

// 使用示例
const color = mapValueToColor(30, 0, 60, ['#ff0000', '#ffff00', '#00ff00']);
// 30 km/h -> 黄色
```

#### 完整示例：道路拥堵可视化

```typescript
import { GradientPolylineLayer } from '@three-map/core';

// 创建渐变线图层
const congestionLayer = new GradientPolylineLayer('congestion');
engine.addLayer(congestionLayer);

// 模拟道路数据
const roads = [
  {
    id: 'road-1',
    coordinates: [
      { lng: 116.3975, lat: 39.9085 },
      { lng: 117.0, lat: 38.5 },
      { lng: 118.0, lat: 37.0 }
    ],
    speed: [60, 30, 10]  // 每段的速度
  },
  {
    id: 'road-2',
    coordinates: [
      { lng: 118.0, lat: 37.0 },
      { lng: 119.0, lat: 35.5 },
      { lng: 120.0, lat: 34.0 }
    ],
    speed: [40, 20, 5]
  }
];

// 添加渐变线
roads.forEach(road => {
  const coords = road.coordinates.map((coord, i) => ({
    ...coord,
    value: road.speed[i]
  }));
  
  congestionLayer.addPolyline({
    id: road.id,
    coordinates: coords,
    clampToGround: true,
    width: 8,
    valueMapping: {
      min: 0,
      max: 60,
      colors: ['#ff0000', '#ff8800', '#ffff00', '#88ff00', '#00ff00']
    }
  });
});

// 实时更新（模拟）
setInterval(() => {
  roads.forEach(road => {
    // 更新速度数据
    road.speed = road.speed.map(s => Math.max(0, s + (Math.random() - 0.5) * 10));
    
    const coords = road.coordinates.map((coord, i) => ({
      ...coord,
      value: road.speed[i]
    }));
    
    congestionLayer.updatePolyline(road.id, { coordinates: coords });
  });
}, 5000);  // 每 5 秒更新
```

### 5.9 图层通用操作

```typescript
// 获取图层
const layer = engine.getLayer('osm-layer');

// 移除图层
engine.removeLayer('osm-layer');

// 设置图层可见性
layer?.setVisible(false);

// 设置图层透明度
layer?.setOpacity(0.5);

// 设置图层顺序（z-index）
layer?.setZIndex(10);
```

---

## 6. 事件系统

### 6.1 点击事件

```typescript
engine.on('click', (event) => {
  const { originalEvent, pickResult } = event;
  
  if (pickResult) {
    switch (pickResult.type) {
      case 'globe':
        console.log('点击地球:', pickResult.cartographic);
        break;
      case 'marker':
        console.log('点击标记:', pickResult.marker);
        break;
      case 'polyline':
        console.log('点击折线:', pickResult.polyline);
        break;
      case 'polygon':
        console.log('点击多边形:', pickResult.polygon);
        break;
    }
  }
});
```

### 6.2 鼠标移动事件

```typescript
engine.on('mousemove', (event) => {
  const { pickResult } = event;
  
  if (pickResult?.type === 'globe') {
    updateMousePosition(pickResult.cartographic);
  }
});
```

### 6.3 相机变化事件

```typescript
engine.on('camerachange', (event) => {
  const { view } = event;
  console.log('相机位置变化:', view);
});
```

### 6.4 错误事件

```typescript
engine.on('error', (error) => {
  const { layerId, stage, category, severity, tileKey } = error;
  
  if (severity === 'fatal') {
    console.error('致命错误:', error);
  }
});
```

### 6.5 移除事件监听

```typescript
const handler = (event) => { /* ... */ };

// 添加监听
engine.on('click', handler);

// 移除监听
engine.off('click', handler);
```

---

## 7. 拾取查询

### 7.1 点击拾取

```typescript
// 通过事件自动拾取
engine.on('click', ({ pickResult }) => {
  if (pickResult) {
    console.log('拾取结果:', pickResult);
  }
});
```

### 7.2 射线查询

```typescript
// 从相机位置发射射线查询
const results = engine.pickRay({
  origin: { lng: 116.3975, lat: 39.9085, altitude: 1000 },
  direction: { x: 0, y: 0, z: -1 }, // 向下
  maxDistance: 10000
});

// 返回命中的要素列表
results.forEach(result => {
  console.log(result.type, result.distance, result.cartographic);
});
```

### 7.3 区域查询

```typescript
// 查询矩形区域内的要素
const features = engine.queryFeatures({
  bounds: {
    west: 116.0,
    south: 39.0,
    east: 117.0,
    north: 40.0
  },
  layers: ['markers', 'polylines'] // 可选：指定图层
});
```

---

## 8. 坐标转换

### 8.1 屏幕坐标转地理坐标

```typescript
// 屏幕坐标转经纬度
const cartographic = engine.screenToCartographic({
  x: 100,  // 屏幕 x 坐标
  y: 200   // 屏幕 y 坐标
});

if (cartographic) {
  console.log('经纬度:', cartographic.lng, cartographic.lat);
}
```

### 8.2 地理坐标转屏幕坐标

```typescript
// 经纬度转屏幕坐标
const screen = engine.cartographicToScreen({
  lng: 116.3975,
  lat: 39.9085,
  altitude: 0
});

if (screen) {
  console.log('屏幕坐标:', screen.x, screen.y);
}
```

---

## 9. 性能监控

### 9.1 获取性能报告

```typescript
const report = engine.getPerformanceReport();
// 返回:
// {
//   fps: number,
//   frameTime: number,
//   drawCalls: number,
//   triangles: number,
//   memory: {
//     geometries: number,
//     textures: number
//   }
// }
```

### 9.2 监听性能变化

```typescript
engine.on('performance', (report) => {
  if (report.fps < 30) {
    console.warn('帧率过低:', report.fps);
  }
});
```

---

## 10. 调试工具

### 10.1 调试选项

```typescript
// 设置调试选项
engine.setDebugOptions({
  showTileBoundaries: true,    // 显示瓦片边界
  showTileCoordinates: true,   // 显示瓦片坐标
  showFrustum: false,          // 显示视锥体
  showCollisionBoxes: false    // 显示碰撞盒
});
```

### 10.2 导出场景信息

```typescript
// 导出当前场景状态
const sceneInfo = engine.exportSceneInfo();
// 返回:
// {
//   visibleTiles: TileInfo[],
//   layers: LayerInfo[],
//   camera: CameraInfo
// }
```

---

## 11. 类型定义

### 11.1 核心类型

```typescript
// 视角
interface EngineView {
  lng: number;
  lat: number;
  altitude: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}

// 地理坐标
interface Cartographic {
  lng: number;
  lat: number;
  altitude?: number;
}

// 屏幕坐标
interface ScreenCoordinate {
  x: number;
  y: number;
}

// 边界
interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}
```

### 11.2 拾取结果类型

```typescript
interface PickResult {
  type: 'globe' | 'marker' | 'polyline' | 'polygon' | 'model';
  cartographic: Cartographic;
  distance: number;
  
  // 根据 type 不同，包含不同的附加信息
  marker?: MarkerPickInfo;
  polyline?: PolylinePickInfo;
  polygon?: PolygonPickInfo;
  feature?: GeoJSON.Feature;
}
```

### 11.3 事件类型

```typescript
interface GlobeEngineEvents {
  click: { originalEvent: MouseEvent; pickResult: PickResult | null };
  dblclick: { originalEvent: MouseEvent; pickResult: PickResult | null };
  mousemove: { originalEvent: MouseEvent; pickResult: PickResult | null };
  camerachange: { view: EngineView };
  error: LayerErrorPayload;
  performance: PerformanceReport;
}
```

---

## 12. 完整示例

```typescript
import {
  GlobeEngine,
  RasterTileSource,
  RasterLayer,
  TerrainTileSource,
  TerrainTileLayer,
  MarkerLayer
} from '@three-map/core';

async function main() {
  // 1. 创建引擎
  const engine = new GlobeEngine({
    container: document.getElementById('map'),
    background: '#020611'
  });

  // 2. 添加数据源
  engine.addSource('osm', new RasterTileSource('osm', {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    minZoom: 0,
    maxZoom: 19
  }));

  engine.addSource('terrain', new TerrainTileSource('terrain', {
    tiles: ['https://elevation-tiles/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    minZoom: 3,
    maxZoom: 12
  }));

  // 3. 添加图层
  engine.addLayer(new TerrainTileLayer('terrain-layer', {
    source: 'terrain',
    meshSegments: 16
  }));

  engine.addLayer(new RasterLayer({
    id: 'osm-layer',
    source: 'osm',
    opacity: 1
  }));

  // 4. 设置视角
  engine.setView({
    lng: 116.3975,
    lat: 39.9085,
    altitude: 10000
  });

  // 5. 添加交互
  engine.on('click', ({ pickResult }) => {
    if (pickResult?.type === 'globe') {
      console.log('点击位置:', pickResult.cartographic);
    }
  });

  // 6. 性能监控
  setInterval(() => {
    const report = engine.getPerformanceReport();
    console.log('FPS:', report.fps);
  }, 1000);
}

main();
```

---

## 13. 验收清单

满足以下项可认为 API 设计达标：

1. [ ] API 命名清晰，符合直觉
2. [ ] 类型定义完整，TypeScript 支持良好
3. [ ] 参数验证完善，错误提示友好
4. [ ] 文档完整，示例可运行
5. [ ] 向后兼容，版本管理规范

---

## 14. 版本管理

### 14.1 语义化版本

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 14.2 废弃策略

```typescript
/**
 * @deprecated 使用 setView() 替代
 * @see setView
 */
function setCamera(view: EngineView): void {
  console.warn('setCamera() 已废弃，请使用 setView()');
  this.setView(view);
}
```