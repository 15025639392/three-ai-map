# 12 Performance Optimization Patterns

## 1. 目标与边界

本章解决Three.js地球引擎的性能优化问题：

1. 如何使用实例化渲染优化大量对象
2. 如何实现高效的瓦片调度和缓存
3. 如何优化GPU内存和CPU计算

本章聚焦性能优化模式，不讨论具体着色器实现（见`11-custom-shaders-and-materials.md`）。

---

## 2. 实例化渲染（Instancing）

### 2.1 问题场景

当需要渲染大量相同几何体时（如标记点、树木、建筑）：
- 传统方式：每个对象一个Mesh，导致大量draw call
- 性能瓶颈：CPU到GPU的通信开销

### 2.2 Three.js实例化渲染

**InstancedMesh使用**：
```typescript
class InstancedMarkerLayer extends Layer {
  private instancedMesh?: THREE.InstancedMesh;
  private markers: Map<string, Marker> = new Map();
  
  createInstancedMesh(): THREE.InstancedMesh | undefined {
    if (this.markers.size === 0) {
      return undefined;
    }
    
    // 1. 创建几何体（所有实例共享）
    this.geometry = new THREE.SphereGeometry(1, 16, 16);
    
    // 2. 创建材质（所有实例共享）
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true  // 支持每个实例不同颜色
    });
    
    // 3. 创建实例化网格
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.markers.size  // 实例数量
    );
    
    // 4. 更新实例数据
    this.updateInstances();
    
    return this.instancedMesh;
  }
  
  updateInstances(): void {
    if (!this.instancedMesh) return;
    
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let index = 0;
    
    for (const marker of this.markers.values()) {
      // 设置变换矩阵
      const position = this.lngLatToWorld(marker.position);
      dummy.position.copy(position);
      dummy.scale.setScalar(marker.size);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(index, dummy.matrix);
      
      // 设置颜色
      color.setHex(marker.color);
      this.instancedMesh.setColorAt(index, color);
      
      index++;
    }
    
    // 标记需要更新
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }
}
```

### 2.3 性能对比

| 方式 | Draw Calls | 内存使用 | 适用场景 |
|------|------------|----------|----------|
| 传统Mesh | N个对象 = N次draw call | 高 | 少量对象，需要独立控制 |
| InstancedMesh | 1次draw call | 低 | 大量相同对象 |

---

## 3. 瓦片调度优化

### 3.1 TileScheduler实现

**核心特性**：
```typescript
export class TileScheduler<TValue, TPayload = unknown> {
  private readonly concurrency: number;        // 并发数
  private readonly maxQueueSize: number;       // 队列大小限制
  private readonly agingFactor: number;        // 老化因子
  private readonly inflight = new Map<string, QueuedRequest<TValue, TPayload>>();
  private readonly queue: Array<QueuedRequest<TValue, TPayload>> = [];
  
  constructor({ concurrency, maxQueueSize, agingFactor, loadTile }: TileSchedulerOptions<TValue, TPayload>) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.maxQueueSize = Math.max(1, Math.floor(maxQueueSize ?? 1));
    this.agingFactor = Math.max(0, agingFactor ?? 0);
    this.loadTile = loadTile;
  }
}
```

### 3.2 优先级调度

**优先级计算**：
```typescript
private computePriority(request: QueuedRequest<TValue, TPayload>): number {
  let priority = request.priority;
  
  // 1. 应用老化因子（防止低优先级饿死）
  const age = Date.now() - request.order;
  priority += age * this.agingFactor;
  
  // 2. 根据可见性调整
  if (this.isVisible(request.payload)) {
    priority += 1000;  // 可见瓦片优先级更高
  }
  
  // 3. 根据距离调整
  const distance = this.getDistance(request.payload);
  priority -= distance * 0.1;  // 距离越远优先级越低
  
  return priority;
}
```

### 3.3 请求去重

```typescript
request(key: string, payload: TPayload, options: TileRequestOptions = {}): Promise<TValue> {
  this.requestedCount += 1;
  
  // 1. 检查是否已存在相同请求
  const existing = this.inflight.get(key);
  if (existing) {
    this.deduplicatedCount += 1;
    
    // 2. 如果是排队中的请求，更新优先级
    if (existing.state === "queued") {
      existing.payload = payload;
      const nextPriority = options.priority ?? existing.priority;
      
      if (existing.priority !== nextPriority) {
        existing.priority = nextPriority;
        this.sortQueue();
        this.trimQueue();
      }
    }
    
    return existing.promise;
  }
  
  // 3. 创建新请求
  return this.createRequest(key, payload, options);
}
```

---

## 4. 缓存优化

### 4.1 LRU缓存实现

**TileCache.ts**（推测实现）：
```typescript
class TileCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private maxBytes: number;
  private currentBytes = 0;
  
  constructor(options: TileCacheOptions) {
    this.maxSize = options.maxSize;
    this.maxBytes = options.maxBytes;
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry) {
      // 更新访问时间（LRU）
      entry.lastAccess = Date.now();
      return entry.value;
    }
    return null;
  }
  
  set(key: string, value: T, size: number): void {
    // 1. 检查是否需要淘汰
    while (this.cache.size >= this.maxSize || this.currentBytes + size > this.maxBytes) {
      this.evict();
    }
    
    // 2. 添加新条目
    this.cache.set(key, {
      value,
      size,
      lastAccess: Date.now()
    });
    this.currentBytes += size;
  }
  
  private evict(): void {
    // 找到最久未访问的条目
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    // 淘汰该条目
    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.currentBytes -= entry.size;
      this.cache.delete(oldestKey);
    }
  }
}
```

### 4.2 缓存策略

**双阈值策略**：
```typescript
const cache = new TileCache<TileData>({
  maxSize: 1000,      // 最大条目数
  maxBytes: 100 * 1024 * 1024  // 最大100MB
});
```

**淘汰优先级**：
```typescript
private getEvictionPriority(entry: CacheEntry<T>): number {
  let priority = 0;
  
  // 1. 最久未访问
  priority += Date.now() - entry.lastAccess;
  
  // 2. 大小权重（优先淘汰大对象）
  priority += entry.size * 0.001;
  
  // 3. 是否正在使用
  if (entry.inUse) {
    priority -= 10000;  // 正在使用的对象优先级很低
  }
  
  return priority;
}
```

---

## 5. GPU内存优化

### 5.1 纹理压缩

**使用压缩纹理格式**：
```typescript
// 1. 检测支持的压缩格式
const gl = renderer.getContext();
const extensions = gl.getSupportedExtensions();

// 2. 使用压缩纹理
const texture = new CompressedTexture(
  mipmaps,
  width,
  height,
  format,  // 如 RGB_S3TC_DXT1
  type
);
```

### 5.2 几何体优化

**索引缓冲区**：
```typescript
// 使用索引减少顶点数量
const geometry = new BufferGeometry();
geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
geometry.setIndex(new Uint16BufferAttribute(indices, 1));  // 索引缓冲区
```

**顶点属性压缩**：
```typescript
// 使用量化减少内存
const positions = new Int16Array(vertices.length);  // 16位整数代替32位浮点
const uvs = new Uint16Array(uvs.length);           // 16位无符号整数
```

---

## 6. CPU计算优化

### 6.1 空间索引

**四叉树实现**（推测）：
```typescript
class QuadTree<T> {
  private bounds: Rectangle;
  private maxItems: number;
  private maxDepth: number;
  private items: T[] = [];
  private children: QuadTree<T>[] | null = null;
  
  insert(item: T, bounds: Rectangle): boolean {
    // 1. 检查是否在边界内
    if (!this.intersects(bounds)) {
      return false;
    }
    
    // 2. 如果有子节点，尝试插入子节点
    if (this.children) {
      for (const child of this.children) {
        if (child.insert(item, bounds)) {
          return true;
        }
      }
    }
    
    // 3. 添加到当前节点
    this.items.push(item);
    
    // 4. 如果超过阈值，分裂节点
    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.split();
    }
    
    return true;
  }
  
  query(bounds: Rectangle): T[] {
    const result: T[] = [];
    
    // 1. 检查当前节点
    for (const item of this.items) {
      if (this.itemIntersects(item, bounds)) {
        result.push(item);
      }
    }
    
    // 2. 递归查询子节点
    if (this.children) {
      for (const child of this.children) {
        if (child.intersects(bounds)) {
          result.push(...child.query(bounds));
        }
      }
    }
    
    return result;
  }
}
```

### 6.2 视锥裁剪

```typescript
class FrustumCuller {
  private frustum = new Frustum();
  private projScreenMatrix = new Matrix4();
  
  update(camera: Camera): void {
    // 更新视锥体
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }
  
  isVisible(object: Object3D): boolean {
    // 检查对象是否在视锥体内
    if (object instanceof Mesh) {
      const geometry = object.geometry;
      if (geometry.boundingSphere === null) {
        geometry.computeBoundingSphere();
      }
      return this.frustum.intersectsSphere(geometry.boundingSphere);
    }
    return true;
  }
}
```

---

## 7. 渲染优化

### 7.1 批处理

**减少状态切换**：
```typescript
class RenderBatcher {
  private batches: Map<string, RenderBatch> = new Map();
  
  add(object: Object3D): void {
    // 根据材质和几何体分组
    const key = this.getBatchKey(object);
    
    if (!this.batches.has(key)) {
      this.batches.set(key, new RenderBatch());
    }
    
    this.batches.get(key)!.add(object);
  }
  
  render(renderer: WebGLRenderer): void {
    // 按批次渲染，减少状态切换
    for (const batch of this.batches.values()) {
      batch.render(renderer);
    }
  }
}
```

### 7.2 细节层次（LOD）

```typescript
class LODManager {
  private levels: Map<number, Mesh> = new Map();
  
  selectLOD(distance: number): Mesh {
    // 根据距离选择合适的LOD级别
    if (distance < 100) {
      return this.levels.get(0)!;  // 高细节
    } else if (distance < 1000) {
      return this.levels.get(1)!;  // 中细节
    } else {
      return this.levels.get(2)!;  // 低细节
    }
  }
}
```

---

## 8. 性能监控

### 8.1 帧率监控

```typescript
class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;
  
  update(): void {
    this.frameCount++;
    const currentTime = performance.now();
    
    if (currentTime - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      // 输出性能信息
      console.log(`FPS: ${this.fps}`);
    }
  }
}
```

### 8.2 内存监控

```typescript
class MemoryMonitor {
  private renderer: WebGLRenderer;
  
  getMemoryInfo(): MemoryInfo {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    
    return {
      textureMemory: this.getTextureMemory(gl),
      geometryMemory: this.getGeometryMemory(gl),
      totalMemory: this.getTotalMemory(gl)
    };
  }
}
```

---

## 9. 实际优化案例

### 9.1 大量标记点优化

**问题**：渲染10万个标记点，帧率低于30fps

**解决方案**：
1. 使用`InstancedMarkerLayer`替代单独的`MarkerLayer`
2. 实现视锥裁剪，只渲染可见标记
3. 使用LOD，远处标记使用简化几何体

**结果**：帧率提升到60fps

### 9.2 瓦片加载优化

**问题**：快速缩放时出现大量空白瓦片

**解决方案**：
1. 实现`TileScheduler`的优先级调度
2. 增加预加载机制
3. 优化缓存策略

**结果**：空白瓦片减少90%

---

## 10. 验收清单

满足以下项可认为性能优化达标：

1. [ ] 帧率稳定在60fps（1080p分辨率）
2. [ ] 内存使用稳定，无泄漏
3. [ ] Draw call数量合理（< 1000）
4. [ ] 纹理内存使用受控
5. [ ] 瓦片加载及时，无明显空白

---

## 11. 参考源码

- `src/layers/InstancedMarkerLayer.ts` - 实例化渲染
- `src/tiles/TileScheduler.ts` - 瓦片调度
- `src/tiles/TileCache.ts` - 缓存实现
- `src/tiles/SurfaceTilePlanner.ts` - 瓦片规划
- `src/core/PerformanceMonitor.ts` - 性能监控

---

## 12. 下一步行动

1. 实现更智能的瓦片预加载
2. 优化实例化渲染的动态更新
3. 添加更多性能监控指标
4. 实现自动性能调优