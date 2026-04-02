# 24 Vector Tile Rendering

## 1. 目标与边界

本章解决矢量瓦片渲染问题：

1. 如何加载和解析矢量瓦片
2. 如何渲染面、线、符号
3. 如何实现样式系统

本章基于 Mapbox 矢量瓦片规范，追求 1:1 复刻。

---

## 2. 矢量瓦片格式

### 2.1 MVT 格式概述

Mapbox Vector Tile (MVT) 是一种紧凑的矢量数据格式：

```
┌─────────────────────────────────────┐
│ Tile (瓦片)                          │
├─────────────────────────────────────┤
│ Layer (图层)                         │
│  ├─ name: "water"                   │
│  ├─ extent: 4096                    │
│  └─ features: [...]                 │
│      ├─ Feature (要素)               │
│      │  ├─ type: Polygon            │
│      │  ├─ geometry: [...]          │
│      │  └─ properties: {...}        │
│      └─ ...                         │
└─────────────────────────────────────┘
```

### 2.2 几何类型

```typescript
enum GeometryType {
  Point = 1,       // 点
  LineString = 2,  // 线
  Polygon = 3      // 面
}

interface VectorTileFeature {
  type: GeometryType;
  geometry: number[];  // 编码后的几何
  properties: Record<string, string | number | boolean>;
  id?: number;
}
```

---

## 3. 矢量瓦片加载

### 3.1 VectorTileSource

```typescript
class VectorTileSource {
  private url: string;
  private cache: TileCache;
  
  constructor(options: VectorTileSourceOptions) {
    this.url = options.url;
    this.cache = new TileCache(options.cacheSize ?? 256);
  }
  
  async loadTile(z: number, x: number, y: number): Promise<VectorTile> {
    const key = `${z}/${x}/${y}`;
    
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached) return cached;
    
    // 加载瓦片
    const url = this.buildUrl(z, x, y);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    
    // 解析
    const tile = this.parse(buffer);
    
    // 缓存
    this.cache.set(key, tile);
    
    return tile;
  }
  
  private buildUrl(z: number, x: number, y: number): string {
    return this.url
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());
  }
  
  private parse(buffer: ArrayBuffer): VectorTile {
    // 使用 @mapbox/vector-tile 解析
    const tile = new VectorTile(new Pbf(buffer));
    return tile;
  }
}
```

### 3.2 使用示例

```typescript
import { VectorTileSource, VectorTileLayer } from '@three-map/core';

// 添加数据源
engine.addSource('mapbox-streets', new VectorTileSource({
  url: 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.mvt?access_token=xxx',
  minZoom: 0,
  maxZoom: 16,
  cacheSize: 512
}));

// 添加图层
engine.addLayer(new VectorTileLayer({
  id: 'water-layer',
  source: 'mapbox-streets',
  sourceLayer: 'water',  // MVT 中的图层名
  type: 'fill',
  paint: {
    'fill-color': '#0077be',
    'fill-opacity': 0.8
  }
}));
```

---

## 4. 样式系统

### 4.1 样式规范（兼容 Mapbox）

```typescript
// 面样式
interface FillStyle {
  'fill-color': string;
  'fill-opacity': number;
  'fill-outline-color'?: string;
}

// 线样式
interface LineStyle {
  'line-color': string;
  'line-width': number | Expression;
  'line-opacity': number;
  'line-dasharray'?: number[];
  'line-cap'?: 'butt' | 'round' | 'square';
  'line-join'?: 'bevel' | 'round' | 'miter';
}

// 符号样式
interface SymbolStyle {
  'text-field': string | Expression;
  'text-size': number | Expression;
  'text-color': string;
  'text-halo-color'?: string;
  'text-halo-width'?: number;
  'icon-image'?: string;
  'icon-size'?: number;
}

// 表达式（动态样式）
type Expression = ['get', string] | ['interpolate', ...any[]] | ['match', ...any[]];
```

### 4.2 表达式解析

```typescript
class ExpressionEvaluator {
  evaluate(expression: Expression, feature: Feature): any {
    switch (expression[0]) {
      case 'get':
        return feature.properties[expression[1]];
        
      case 'interpolate':
        return this.interpolate(expression, feature);
        
      case 'match':
        return this.match(expression, feature);
        
      case 'case':
        return this.case(expression, feature);
        
      default:
        return expression;
    }
  }
  
  private interpolate(expr: Expression, feature: Feature): number {
    const [_, type, input, ...stops] = expr;
    const value = this.evaluate(input, feature);
    
    // 查找插值区间
    for (let i = 0; i < stops.length - 2; i += 2) {
      const stopValue = stops[i];
      const output = stops[i + 1];
      const nextStopValue = stops[i + 2];
      const nextOutput = stops[i + 3];
      
      if (value >= stopValue && value <= nextStopValue) {
        const t = (value - stopValue) / (nextStopValue - stopValue);
        return output + (nextOutput - output) * t;
      }
    }
    
    return stops[stops.length - 1];
  }
}
```

### 4.3 使用示例

```typescript
// 根据属性动态设置颜色
engine.addLayer(new VectorTileLayer({
  id: 'roads',
  source: 'mapbox-streets',
  sourceLayer: 'road',
  type: 'line',
  paint: {
    'line-color': [
      'match',
      ['get', 'class'],
      'motorway', '#ff0000',
      'trunk', '#ff8800',
      'primary', '#ffff00',
      'secondary', '#88ff00',
      '#ffffff'  // 默认
    ],
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5, 1,
      10, 2,
      15, 4,
      20, 8
    ]
  }
}));
```

---

## 5. 面渲染

### 5.1 FillBucket

```typescript
class FillBucket {
  private vertices: number[] = [];
  private indices: number[] = [];
  
  addFeature(feature: VectorTileFeature, extent: number): void {
    const geometry = this.decodeGeometry(feature.geometry, feature.type);
    
    for (const ring of geometry) {
      // 三角化多边形
      const triangles = this.triangulate(ring);
      
      // 添加顶点
      const startIndex = this.vertices.length / 2;
      for (const point of ring) {
        this.vertices.push(point.x / extent, point.y / extent);
      }
      
      // 添加索引
      for (const triangle of triangles) {
        this.indices.push(
          startIndex + triangle[0],
          startIndex + triangle[1],
          startIndex + triangle[2]
        );
      }
    }
  }
  
  private triangulate(ring: Point[]): [number, number, number][] {
    // Earcut 三角化
    const flat = ring.flatMap(p => [p.x, p.y]);
    const triangles = earcut(flat);
    
    const result: [number, number, number][] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      result.push([triangles[i], triangles[i + 1], triangles[i + 2]]);
    }
    
    return result;
  }
}
```

### 5.2 Fill 渲染

```typescript
class FillRenderer {
  private material: ShaderMaterial;
  private geometry: BufferGeometry;
  private mesh: Mesh;
  
  render(bucket: FillBucket, style: FillStyle, transform: Transform): void {
    // 更新几何
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(bucket.vertices, 2)
    );
    this.geometry.setIndex(bucket.indices);
    
    // 更新材质
    this.material.uniforms.color.value = new Color(style['fill-color']);
    this.material.uniforms.opacity.value = style['fill-opacity'];
    
    // 渲染
    this.renderer.render(this.mesh, camera);
  }
}
```

---

## 6. 线渲染

### 6.1 LineBucket

```typescript
class LineBucket {
  private vertices: number[] = [];
  private indices: number[] = [];
  
  addFeature(
    feature: VectorTileFeature,
    style: LineStyle,
    extent: number
  ): void {
    const geometry = this.decodeGeometry(feature.geometry, feature.type);
    const lineWidth = this.evaluateWidth(style['line-width']);
    const lineJoin = style['line-join'] ?? 'miter';
    const lineCap = style['line-cap'] ?? 'butt';
    
    for (const line of geometry) {
      this.addLine(line, lineWidth, lineJoin, lineCap, extent);
    }
  }
  
  private addLine(
    line: Point[],
    width: number,
    join: string,
    cap: string,
    extent: number
  ): void {
    // 计算线的法线
    for (let i = 0; i < line.length - 1; i++) {
      const p0 = line[i];
      const p1 = line[i + 1];
      
      // 方向向量
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      // 法线向量
      const nx = -dy / length;
      const ny = dx / length;
      
      // 偏移
      const offset = width / 2;
      
      // 添加四边形
      const baseIndex = this.vertices.length / 2;
      
      this.vertices.push(
        (p0.x + nx * offset) / extent, (p0.y + ny * offset) / extent,
        (p0.x - nx * offset) / extent, (p0.y - ny * offset) / extent,
        (p1.x + nx * offset) / extent, (p1.y + ny * offset) / extent,
        (p1.x - nx * offset) / extent, (p1.y - ny * offset) / extent
      );
      
      this.indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex + 1, baseIndex + 3, baseIndex + 2
      );
    }
    
    // 处理线帽和连接
    this.addCaps(line, width, cap, extent);
    this.addJoins(line, width, join, extent);
  }
}
```

### 6.2 Line 渲染

```typescript
class LineRenderer {
  render(bucket: LineBucket, style: LineStyle, transform: Transform): void {
    // 更新几何
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(bucket.vertices, 2)
    );
    this.geometry.setIndex(bucket.indices);
    
    // 更新材质
    this.material.uniforms.color.value = new Color(style['line-color']);
    this.material.uniforms.opacity.value = style['line-opacity'];
    
    // 虚线
    if (style['line-dasharray']) {
      this.material.uniforms.dashArray.value = style['line-dasharray'];
    }
    
    // 渲染
    this.renderer.render(this.mesh, camera);
  }
}
```

---

## 7. 符号渲染

### 7.1 文字渲染

```typescript
class TextBucket {
  private quads: TextQuad[] = [];
  
  addFeature(
    feature: VectorTileFeature,
    style: SymbolStyle,
    extent: number
  ): void {
    const text = this.evaluateText(style['text-field'], feature);
    const position = this.getAnchorPoint(feature, extent);
    const size = this.evaluateSize(style['text-size']);
    
    // 生成文字四边形
    const glyphs = this.shapeText(text, style);
    
    for (const glyph of glyphs) {
      this.quads.push({
        position: position.clone().add(glyph.offset),
        size: glyph.size,
        texCoord: glyph.texCoord
      });
    }
  }
  
  private shapeText(text: string, style: SymbolStyle): Glyph[] {
    // 文字塑形（参考 Mapbox shaping.js）
    const fontStack = this.getFontStack(style);
    const glyphs: Glyph[] = [];
    
    let x = 0;
    for (const char of text) {
      const glyph = this.getGlyph(char, fontStack);
      
      glyphs.push({
        char,
        offset: new Vector2(x, 0),
        size: new Vector2(glyph.width, glyph.height),
        texCoord: glyph.texCoord
      });
      
      x += glyph.advance;
    }
    
    return glyphs;
  }
}
```

### 7.2 图标渲染

```typescript
class IconBucket {
  private quads: IconQuad[] = [];
  
  addFeature(
    feature: VectorTileFeature,
    style: SymbolStyle,
    extent: number
  ): void {
    const iconName = this.evaluateIcon(style['icon-image'], feature);
    const position = this.getAnchorPoint(feature, extent);
    const size = this.evaluateSize(style['icon-size']);
    
    const icon = this.getIcon(iconName);
    
    this.quads.push({
      position,
      size: new Vector2(icon.width * size, icon.height * size),
      texCoord: icon.texCoord
    });
  }
}
```

### 7.3 碰撞检测

```typescript
class CollisionIndex {
  private grid: GridIndex;
  
  constructor(width: number, height: number) {
    this.grid = new GridIndex(width, height, 25);
  }
  
  // 检查是否可以放置
  canPlace(box: CollisionBox): boolean {
    // 检查是否与已有符号重叠
    const candidates = this.grid.query(box);
    
    for (const candidate of candidates) {
      if (this.intersects(box, candidate)) {
        return false;
      }
    }
    
    return true;
  }
  
  // 插入符号
  place(box: CollisionBox): boolean {
    if (!this.canPlace(box)) {
      return false;
    }
    
    this.grid.insert(box);
    return true;
  }
  
  // 清空
  clear(): void {
    this.grid.clear();
  }
}
```

---

## 8. 过滤器

### 8.1 过滤器表达式

```typescript
type Filter =
  | ['==', string, any]
  | ['!=', string, any]
  | ['>', string, number]
  | ['>=', string, number]
  | ['<', string, number]
  | ['<=', string, number]
  | ['in', string, ...any[]]
  | ['!in', string, ...any[]]
  | ['all', ...Filter[]]
  | ['any', ...Filter[]]
  | ['none', ...Filter[]];
```

### 8.2 过滤器执行

```typescript
class FilterEvaluator {
  evaluate(filter: Filter, feature: Feature): boolean {
    const [op, ...args] = filter;
    
    switch (op) {
      case '==':
        return feature.properties[args[0]] === args[1];
        
      case '!=':
        return feature.properties[args[0]] !== args[1];
        
      case '>':
        return feature.properties[args[0]] > args[1];
        
      case '>=':
        return feature.properties[args[0]] >= args[1];
        
      case '<':
        return feature.properties[args[0]] < args[1];
        
      case '<=':
        return feature.properties[args[0]] <= args[1];
        
      case 'in':
        return args.slice(1).includes(feature.properties[args[0]]);
        
      case '!in':
        return !args.slice(1).includes(feature.properties[args[0]]);
        
      case 'all':
        return args.every(f => this.evaluate(f, feature));
        
      case 'any':
        return args.some(f => this.evaluate(f, feature));
        
      case 'none':
        return !args.some(f => this.evaluate(f, feature));
        
      default:
        return true;
    }
  }
}
```

### 8.3 使用示例

```typescript
// 只显示高速公路和主干道
engine.addLayer(new VectorTileLayer({
  id: 'major-roads',
  source: 'mapbox-streets',
  sourceLayer: 'road',
  type: 'line',
  filter: ['in', ['get', 'class'], 'motorway', 'trunk', 'primary'],
  paint: {
    'line-color': '#ff0000',
    'line-width': 4
  }
}));
```

---

## 9. GeoJSON 数据源

### 9.1 GeoJSONSource

```typescript
class GeoJSONSource {
  private data: GeoJSON.FeatureCollection;
  private cache: Map<string, VectorTile> = new Map();
  
  constructor(options: GeoJSONSourceOptions) {
    this.data = options.data;
  }
  
  // 将 GeoJSON 转换为虚拟瓦片
  getTile(z: number, x: number, y: number): VectorTile {
    const key = `${z}/${x}/${y}`;
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    // 计算瓦片边界
    const bounds = tileToBounds(z, x, y);
    
    // 过滤和裁剪要素
    const features = this.clipFeatures(this.data.features, bounds);
    
    // 创建虚拟瓦片
    const tile = this.createTile(features, bounds);
    
    this.cache.set(key, tile);
    
    return tile;
  }
  
  private clipFeatures(
    features: GeoJSON.Feature[],
    bounds: LngLatBounds
  ): GeoJSON.Feature[] {
    return features.filter(feature => {
      const featureBounds = this.getBounds(feature);
      return this.intersects(featureBounds, bounds);
    });
  }
}
```

### 9.2 使用示例

```typescript
import { GeoJSONSource, VectorTileLayer } from '@three-map/core';

// 添加 GeoJSON 数据源
engine.addSource('markers', new GeoJSONSource({
  data: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [116.3975, 39.9085]
        },
        properties: {
          name: 'Beijing',
          population: 21540000
        }
      }
    ]
  }
}));

// 添加符号图层
engine.addLayer(new VectorTileLayer({
  id: 'city-labels',
  source: 'markers',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 14
  },
  paint: {
    'text-color': '#000000',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2
  }
}));
```

---

## 10. 完整示例

```typescript
import {
  VectorTileSource,
  VectorTileLayer,
  GeoJSONSource
} from '@three-map/core';

// 1. 添加矢量瓦片源
engine.addSource('streets', new VectorTileSource({
  url: 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.mvt',
  minZoom: 0,
  maxZoom: 16
}));

// 2. 添加水体图层
engine.addLayer(new VectorTileLayer({
  id: 'water',
  source: 'streets',
  sourceLayer: 'water',
  type: 'fill',
  paint: {
    'fill-color': '#0077be',
    'fill-opacity': 0.8
  }
}));

// 3. 添加道路图层（按等级着色）
engine.addLayer(new VectorTileLayer({
  id: 'roads',
  source: 'streets',
  sourceLayer: 'road',
  type: 'line',
  filter: ['!=', ['get', 'type'], 'service'],
  paint: {
    'line-color': [
      'match',
      ['get', 'class'],
      'motorway', '#ff0000',
      'trunk', '#ff8800',
      'primary', '#ffff00',
      '#ffffff'
    ],
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5, 1,
      15, 4
    ]
  }
}));

// 4. 添加建筑图层
engine.addLayer(new VectorTileLayer({
  id: 'buildings',
  source: 'streets',
  sourceLayer: 'building',
  type: 'fill',
  paint: {
    'fill-color': '#cccccc',
    'fill-opacity': 0.9
  }
}));

// 5. 添加 POI 标签
engine.addLayer(new VectorTileLayer({
  id: 'poi-labels',
  source: 'streets',
  sourceLayer: 'poi_label',
  type: 'symbol',
  filter: ['>', ['get', 'rank'], 2],
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 12,
    'icon-image': ['concat', ['get', 'maki'], '-15']
  },
  paint: {
    'text-color': '#333333'
  }
}));
```

---

## 11. 性能优化

### 1.1 瓦片缓存

```typescript
class VectorTileCache {
  private cache: Map<string, CachedTile> = new Map();
  private maxSize: number;
  private currentSize: number = 0;
  
  constructor(maxSize: number = 512) {
    this maxSize = maxSize;
  }
  
  get(key: string): VectorTile | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // 更新访问时间
    cached.lastAccess = Date.now();
    return cached.tile;
  }
  
  set(key: string, tile: VectorTile): void {
    // 淘汰旧瓦片
    while (this.currentSize >= this.maxSize) {
      this.evict();
    }
    
    this.cache.set(key, {
      tile,
      lastAccess: Date.now(),
      size: this.calculateSize(tile)
    });
    this.currentSize++;
  }
  
  private evict(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, cached] of this.cache) {
      if (cached.lastAccess < oldestTime) {
        oldestTime = cached.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.currentSize--;
    }
  }
}
```

### 1.2 几何批处理

```typescript
class GeometryBatcher {
  private batches: Map<string, GeometryBatch> = new Map();
  
  addGeometry(
    materialId: string,
    vertices: Float32Array,
    indices: Uint32Array
  ): void {
    if (!this.batches.has(materialId)) {
      this.batches.set(materialId, new GeometryBatch());
    }
    
    this.batches.get(materialId)!.add(vertices, indices);
  }
  
  render(renderer: WebGLRenderer): void {
    for (const batch of this.batches.values()) {
      batch.render(renderer);
    }
  }
}
```

---

## 12. 验收清单

满足以下项可认为矢量瓦片渲染达标：

1. [ ] 瓦片加载正确
2. [ ] 面渲染正确
3. [ ] 线渲染正确（包括端点和连接）
4. [ ] 符号渲染正确（文字和图标）
5. [ ] 碰撞检测有效
6. [ ] 过滤器工作正常
7. [ ] 表达式解析正确
8. [ ] 性能满足要求

---

## 13. 参考源码

- `src/sources/VectorTileSource.ts` - 矢量瓦片源
- `src/layers/VectorTileLayer.ts` - 矢量瓦片图层
- `src/tiles/buckets/FillBucket.ts` - 面桶
- `src/tiles/buckets/LineBucket.ts` - 线桶
- `src/tiles/buckets/SymbolBucket.ts` - 符号桶

---

## 14. 下一步行动

1. 优化碰撞检测性能
2. 添加更多表达式支持
3. 完善符号渲染
4. 支持更多数据源格式