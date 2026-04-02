# 18 Texture & GPU Memory Management

## 1. 目标与边界

本章解决纹理和 GPU 内存管理问题：

1. 如何管理纹理生命周期
2. 如何使用 Texture Atlas 优化渲染
3. 如何控制 GPU 内存预算

本章聚焦纹理和 GPU 内存管理，不讨论具体渲染管线（见`17-webgl-rendering-pipeline.md`）。

---

## 2. 纹理生命周期管理

### 2.1 纹理创建

```typescript
class TextureManager {
  private textures: Map<string, Texture> = new Map();
  private memoryUsage = 0;
  private memoryBudget: number;
  
  constructor(memoryBudget: number = 512 * 1024 * 1024) { // 默认 512MB
    this.memoryBudget = memoryBudget;
  }
  
  create(
    id: string,
    source: TexImageSource,
    options: TextureOptions = {}
  ): Texture {
    // 检查内存预算
    const size = this.calculateTextureSize(source, options);
    if (this.memoryUsage + size > this.memoryBudget) {
      this.evict(size);
    }
    
    // 创建纹理
    const texture = new Texture(source);
    texture.minFilter = options.minFilter || LinearMipmapLinearFilter;
    texture.magFilter = options.magFilter || LinearFilter;
    texture.wrapS = options.wrapS || ClampToEdgeWrapping;
    texture.wrapT = options.wrapT || ClampToEdgeWrapping;
    texture.generateMipmaps = options.generateMipmaps !== false;
    texture.format = options.format || RGBAFormat;
    texture.type = options.type || UnsignedByteType;
    
    this.textures.set(id, texture);
    this.memoryUsage += size;
    
    return texture;
  }
  
  private calculateTextureSize(source: TexImageSource, options: TextureOptions): number {
    const width = source.width;
    const height = source.height;
    const bytesPerPixel = this.getBytesPerPixel(options.format, options.type);
    
    let size = width * height * bytesPerPixel;
    
    // MIPMAP 额外内存
    if (options.generateMipmaps !== false) {
      size *= 1.33; // 约 33% 额外
    }
    
    return size;
  }
  
  private getBytesPerPixel(format: TextureFormat, type: TextureType): number {
    switch (format) {
      case RGBAFormat:
        return type === UnsignedByteType ? 4 : 2;
      case RGBFormat:
        return type === UnsignedByteType ? 3 : 2;
      case LuminanceFormat:
        return 1;
      case AlphaFormat:
        return 1;
      default:
        return 4;
    }
  }
}
```

### 2.2 纹理淘汰

```typescript
class TextureEvictionPolicy {
  private textures: Map<string, TextureEntry> = new Map();
  private accessOrder: string[] = [];
  
  recordAccess(id: string): void {
    const entry = this.textures.get(id);
    if (!entry) return;
    
    // 更新访问时间
    entry.lastAccess = Date.now();
    
    // LRU: 移动到末尾
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(id);
  }
  
  selectForEviction(requiredSize: number): string[] {
    const evictList: string[] = [];
    let freedSize = 0;
    
    // 从最久未访问的开始淘汰
    for (const id of this.accessOrder) {
      const entry = this.textures.get(id)!;
      
      // 跳过正在使用的纹理
      if (entry.inUse) continue;
      
      evictList.push(id);
      freedSize += entry.size;
      
      if (freedSize >= requiredSize) {
        break;
      }
    }
    
    return evictList;
  }
  
  evict(id: string): void {
    const entry = this.textures.get(id);
    if (!entry) return;
    
    // 释放纹理
    entry.texture.dispose();
    
    // 从缓存中移除
    this.textures.delete(id);
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}
```

### 2.3 纹理引用计数

```typescript
class TextureReferenceManager {
  private references: Map<string, number> = new Map();
  
  acquire(id: string): void {
    const count = this.references.get(id) || 0;
    this.references.set(id, count + 1);
  }
  
  release(id: string): void {
    const count = this.references.get(id) || 0;
    if (count <= 1) {
      this.references.delete(id);
      this.textureManager.release(id);
    } else {
      this.references.set(id, count - 1);
    }
  }
  
  getReferenceCount(id: string): number {
    return this.references.get(id) || 0;
  }
}
```

---

## 3. Texture Atlas

### 3.1 Atlas 数据结构

```typescript
interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AtlasEntry {
  id: string;
  rect: AtlasRect;
  uv: {
    u0: number;
    v0: number;
    u1: number;
    v1: number;
  };
}
```

### 3.2 Atlas 实现

```typescript
class TextureAtlas {
  private texture: Texture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private entries: Map<string, AtlasEntry> = new Map();
  private packer: RectPacker;
  
  constructor(size: number = 4096) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    
    this.packer = new RectPacker(size, size);
    this.texture = new Texture(this.canvas);
    this.texture.needsUpdate = true;
  }
  
  add(id: string, image: HTMLImageElement): AtlasEntry | null {
    // 检查是否已存在
    if (this.entries.has(id)) {
      return this.entries.get(id)!;
    }
    
    // 打包矩形
    const rect = this.packer.pack(image.width, image.height);
    if (!rect) {
      return null; // Atlas 已满
    }
    
    // 绘制到 Canvas
    this.ctx.drawImage(image, rect.x, rect.y);
    
    // 计算 UV 坐标
    const size = this.canvas.width;
    const entry: AtlasEntry = {
      id,
      rect,
      uv: {
        u0: rect.x / size,
        v0: rect.y / size,
        u1: (rect.x + rect.width) / size,
        v1: (rect.y + rect.height) / size
      }
    };
    
    this.entries.set(id, entry);
    this.texture.needsUpdate = true;
    
    return entry;
  }
  
  get(id: string): AtlasEntry | undefined {
    return this.entries.get(id);
  }
  
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    
    // 清除区域
    this.ctx.clearRect(
      entry.rect.x,
      entry.rect.y,
      entry.rect.width,
      entry.rect.height
    );
    
    this.entries.delete(id);
    this.packer.unpack(entry.rect);
    this.texture.needsUpdate = true;
  }
  
  getTexture(): Texture {
    return this.texture;
  }
}

// 矩形打包器
class RectPacker {
  private width: number;
  private height: number;
  private spaces: AtlasRect[] = [];
  
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.spaces.push({ x: 0, y: 0, width, height });
  }
  
  pack(width: number, height: number): AtlasRect | null {
    // 寻找最佳空间
    let bestSpace: AtlasRect | null = null;
    let bestIndex = -1;
    
    for (let i = 0; i < this.spaces.length; i++) {
      const space = this.spaces[i];
      
      if (space.width >= width && space.height >= height) {
        if (!bestSpace || space.width * space.height < bestSpace.width * bestSpace.height) {
          bestSpace = space;
          bestIndex = i;
        }
      }
    }
    
    if (!bestSpace) return null;
    
    // 分割空间
    const rect: AtlasRect = {
      x: bestSpace.x,
      y: bestSpace.y,
      width,
      height
    };
    
    // 移除已用空间
    this.spaces.splice(bestIndex, 1);
    
    // 添加剩余空间
    if (bestSpace.width > width) {
      this.spaces.push({
        x: bestSpace.x + width,
        y: bestSpace.y,
        width: bestSpace.width - width,
        height: bestSpace.height
      });
    }
    
    if (bestSpace.height > height) {
      this.spaces.push({
        x: bestSpace.x,
        y: bestSpace.y + height,
        width: width,
        height: bestSpace.height - height
      });
    }
    
    return rect;
  }
  
  unpack(rect: AtlasRect): void {
    this.spaces.push(rect);
    this.mergeSpaces();
  }
  
  private mergeSpaces(): void {
    // 合并相邻空间
    for (let i = 0; i < this.spaces.length; i++) {
      for (let j = i + 1; j < this.spaces.length; j++) {
        const a = this.spaces[i];
        const b = this.spaces[j];
        
        // 检查是否可以合并
        if (this.canMerge(a, b)) {
          this.spaces[i] = this.merge(a, b);
          this.spaces.splice(j, 1);
          j--;
        }
      }
    }
  }
  
  private canMerge(a: AtlasRect, b: AtlasRect): boolean {
    return (
      (a.x === b.x && a.width === b.width && (a.y + a.height === b.y || b.y + b.height === a.y)) ||
      (a.y === b.y && a.height === b.height && (a.x + a.width === b.x || b.x + b.width === a.x))
    );
  }
  
  private merge(a: AtlasRect, b: AtlasRect): AtlasRect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
      height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y)
    };
  }
}
```

### 3.3 Atlas 着色器支持

```glsl
// 顶点着色器
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// 片段着色器
uniform sampler2D atlasTexture;
uniform vec4 atlasUV; // u0, v0, u1, v1

varying vec2 vUv;

void main() {
  // 将 UV 坐标映射到 Atlas 区域
  vec2 uv = vec2(
    mix(atlasUV.x, atlasUV.z, vUv.x),
    mix(atlasUV.y, atlasUV.w, vUv.y)
  );
  
  gl_FragColor = texture2D(atlasTexture, uv);
}
```

---

## 4. MIPMAP 管理

### 4.1 MIPMAP 生成

```typescript
class MipmapGenerator {
  generate(texture: Texture): void {
    const gl = texture.renderer.getContext();
    const levels = Math.log2(Math.max(texture.image.width, texture.image.height));
    
    // 生成 MIPMAP
    gl.generateMipmap(gl.TEXTURE_2D);
    
    // 或手动生成
    for (let level = 0; level < levels; level++) {
      const width = texture.image.width >> level;
      const height = texture.image.height >> level;
      
      // 缩小图像
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(texture.image, 0, 0, width, height);
      
      // 上传到 GPU
      gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
      );
    }
  }
}
```

### 4.2 自适应 MIPMAP

```typescript
class AdaptiveMipmap {
  private devicePixelRatio: number;
  private maxLevel: number;
  
  constructor() {
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.maxLevel = Math.ceil(Math.log2(this.devicePixelRatio));
  }
  
  getRequiredLevel(distance: number, textureSize: number): number {
    // 根据距离和纹理大小计算需要的 MIPMAP 级别
    const screenPixels = textureSize / distance;
    const requiredLevel = Math.ceil(Math.log2(screenPixels));
    
    return Math.min(requiredLevel, this.maxLevel);
  }
  
  shouldGenerateMipmap(distance: number, textureSize: number): boolean {
    return this.getRequiredLevel(distance, textureSize) > 0;
  }
}
```

---

## 5. 压缩纹理

### 5.1 压缩格式检测

```typescript
class CompressionDetector {
  private supportedFormats: Set<string> = new Set();
  
  constructor(renderer: WebGLRenderer) {
    const gl = renderer.getContext();
    
    // 检测 S3TC
    const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc');
    if (s3tc) {
      this.supportedFormats.add('s3tc');
    }
    
    // 检测 ETC
    const etc = gl.getExtension('WEBGL_compressed_texture_etc');
    if (etc) {
      this.supportedFormats.add('etc');
    }
    
    // 检测 ASTC
    const astc = gl.getExtension('WEBGL_compressed_texture_astc');
    if (astc) {
      this.supportedFormats.add('astc');
    }
    
    // 棟测 PVRTC
    const pvrtc = gl.getExtension('WEBGL_compressed_texture_pvrtc');
    if (pvrtc) {
      this.supportedFormats.add('pvrtc');
    }
  }
  
  isSupported(format: string): boolean {
    return this.supportedFormats.has(format);
  }
  
  getBestFormat(): string {
    if (this.supportedFormats.has('astc')) return 'astc';
    if (this.supportedFormats.has('s3tc')) return 's3tc';
    if (this.supportedFormats.has('etc')) return 'etc';
    if (this.supportedFormats.has('pvrtc')) return 'pvrtc';
    return 'uncompressed';
  }
}
```

### 5.2 压缩纹理加载

```typescript
class CompressedTextureLoader {
  async load(url: string, format: string): Promise<CompressedTexture> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    
    // 解析压缩纹理格式
    const texture = this.parseCompressedTexture(buffer, format);
    
    return texture;
  }
  
  private parseCompressedTexture(buffer: ArrayBuffer, format: string): CompressedTexture {
    // 根据格式解析
    switch (format) {
      case 's3tc':
        return this.parseS3TC(buffer);
      case 'etc':
        return this.parseETC(buffer);
      case 'astc':
        return this.parseASTC(buffer);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  private parseS3TC(buffer: ArrayBuffer): CompressedTexture {
    // S3TC/DXT 格式解析
    const view = new DataView(buffer);
    
    // 读取头部
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const format = view.getUint32(8, true);
    const dataSize = view.getUint32(12, true);
    
    // 读取数据
    const data = new Uint8Array(buffer, 16, dataSize);
    
    return {
      width,
      height,
      format,
      data,
      mipmaps: this.generateMipmaps(data, width, height, format)
    };
  }
}
```

---

## 6. GPU 内存预算

### 6.1 内存跟踪

```typescript
class GPUMemoryTracker {
  private allocations: Map<string, number> = new Map();
  private totalUsage = 0;
  private budget: number;
  
  constructor(budget: number) {
    this.budget = budget;
  }
  
  allocate(id: string, size: number): boolean {
    if (this.totalUsage + size > this.budget) {
      return false;
    }
    
    this.allocations.set(id, size);
    this.totalUsage += size;
    return true;
  }
  
  deallocate(id: string): void {
    const size = this.allocations.get(id);
    if (size) {
      this.allocations.delete(id);
      this.totalUsage -= size;
    }
  }
  
  getUsage(): number {
    return this.totalUsage;
  }
  
  getBudget(): number {
    return this.budget;
  }
  
  getAvailable(): number {
    return this.budget - this.totalUsage;
  }
}
```

### 6.2 自适应预算

```typescript
class AdaptiveBudget {
  private baseBudget: number;
  private deviceMemory: number;
  private gpuMemory: number;
  
  constructor(baseBudget: number) {
    this.baseBudget = baseBudget;
    this.deviceMemory = this.detectDeviceMemory();
    this.gpuMemory = this.detectGPUMemory();
  }
  
  private detectDeviceMemory(): number {
    // @ts-ignore
    return navigator.deviceMemory || 4; // 默认 4GB
  }
  
  private detectGPUMemory(): number {
    // 尝试检测 GPU 内存
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 512; // 默认 512MB
    
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 512;
    
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    
    // 根据 GPU 型号估算
    if (renderer.includes('NVIDIA')) return 2048;
    if (renderer.includes('AMD')) return 2048;
    if (renderer.includes('Intel')) return 1024;
    
    return 512;
  }
  
  calculateBudget(): number {
    // 根据设备能力调整预算
    let budget = this.baseBudget;
    
    // 根据设备内存调整
    if (this.deviceMemory < 4) {
      budget *= 0.5;
    } else if (this.deviceMemory >= 8) {
      budget *= 1.5;
    }
    
    // 根据 GPU 内存调整
    if (this.gpuMemory < 512) {
      budget *= 0.5;
    } else if (this.gpuMemory >= 2048) {
      budget *= 1.5;
    }
    
    return Math.floor(budget);
  }
}
```

### 6.3 内存压力处理

```typescript
class MemoryPressureHandler {
  private textureManager: TextureManager;
  private budget: GPUMemoryTracker;
  private thresholds = {
    warning: 0.7,
    critical: 0.9
  };
  
  constructor(textureManager: TextureManager, budget: GPUMemoryTracker) {
    this.textureManager = textureManager;
    this.budget = budget;
  }
  
  check(): MemoryPressureLevel {
    const usage = this.budget.getUsage() / this.budget.getBudget();
    
    if (usage >= this.thresholds.critical) {
      return MemoryPressureLevel.CRITICAL;
    } else if (usage >= this.thresholds.warning) {
      return MemoryPressureLevel.WARNING;
    }
    
    return MemoryPressureLevel.NORMAL;
  }
  
  handle(level: MemoryPressureLevel): void {
    switch (level) {
      case MemoryPressureLevel.WARNING:
        this.reduceQuality();
        break;
      case MemoryPressureLevel.CRITICAL:
        this.emergencyEviction();
        break;
    }
  }
  
  private reduceQuality(): void {
    // 降低纹理质量
    this.textureManager.setMaxResolution(1024);
    this.textureManager.disableMipmaps();
  }
  
  private emergencyEviction(): void {
    // 紧急淘汰
    this.textureManager.evictUntil(0.5);
  }
}
```

---

## 7. 性能优化

### 7.1 纹理上传优化

```typescript
class TextureUploadOptimizer {
  private queue: Array<{ texture: Texture, priority: number }> = [];
  private uploading = false;
  
  enqueue(texture: Texture, priority: number): void {
    this.queue.push({ texture, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    
    if (!this.uploading) {
      this.processQueue();
    }
  }
  
  private async processQueue(): Promise<void> {
    this.uploading = true;
    
    while (this.queue.length > 0) {
      const { texture } = this.queue.shift()!;
      
      // 使用 requestIdleCallback 在空闲时上传
      await new Promise<void>(resolve => {
        requestIdleCallback(() => {
          texture.needsUpdate = true;
          resolve();
        }, { timeout: 16 });
      });
    }
    
    this.uploading = false;
  }
}
```

### 7.2 纹理预加载

```typescript
class TexturePreloader {
  private cache: Map<string, Promise<Texture>> = new Map();
  
  preload(urls: string[]): void {
    for (const url of urls) {
      if (!this.cache.has(url)) {
        this.cache.set(url, this.loadTexture(url));
      }
    }
  }
  
  async get(url: string): Promise<Texture> {
    let promise = this.cache.get(url);
    
    if (!promise) {
      promise = this.loadTexture(url);
      this.cache.set(url, promise);
    }
    
    return promise;
  }
  
  private async loadTexture(url: string): Promise<Texture> {
    const loader = new TextureLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }
}
```

---

## 8. 验收清单

满足以下项可认为纹理管理达标：

1. [ ] 纹理生命周期管理完整
2. [ ] Texture Atlas 实现并有效减少 draw call
3. [ ] MIPMAP 生成和使用正确
4. [ ] 压缩纹理支持并有效减少内存
5. [ ] GPU 内存预算控制有效
6. [ ] 内存压力处理机制完善
7. [ ] 纹理上传优化生效

---

## 9. 参考源码

- `src/core/TextureManager.ts` - 纹理管理器
- `src/core/TextureAtlas.ts` - Texture Atlas 实现
- `src/core/GPUMemoryTracker.ts` - GPU 内存跟踪
- `src/core/CompressionDetector.ts` - 压缩格式检测

---

## 10. 下一步行动

1. 实现完整的纹理管理器
2. 优化 Texture Atlas 打包算法
3. 添加更多压缩格式支持
4. 完善内存压力处理