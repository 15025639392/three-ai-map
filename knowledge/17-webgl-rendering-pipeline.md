# 17 WebGL Rendering Pipeline

## 1. 目标与边界

本章解决 WebGL 渲染管线的实现问题：

1. 如何设计 Pass 化渲染管线
2. 如何管理 Framebuffer 和渲染状态
3. 如何优化渲染性能

本章聚焦 WebGL 渲染管线，不讨论具体着色器实现（见`11-custom-shaders-and-materials.md`）。

---

## 2. 渲染管线概述

### 2.1 Cesium 的 Pass 化渲染

Cesium 使用显式的 DrawCommand 队列，按 Pass 组织渲染：

```
渲染顺序：
1. Environment Pass (星空、大气)
2. Opaque Pass (地形、不透明物体)
3. Translucent Pass (半透明物体)
4. Overlay Pass (标注、UI)
```

### 2.2 Three.js 的渲染方式

Three.js 使用 Scene 图，通过 renderOrder 和 depth 控制排序：

```typescript
// Three.js 渲染方式
renderer.render(scene, camera);

// 通过 renderOrder 控制渲染顺序
mesh.renderOrder = 100;

// 通过 depth 控制深度测试
material.depthTest = true;
material.depthWrite = true;
```

---

## 3. Pass 化渲染实现

### 3.1 Pass 接口定义

```typescript
interface RenderPass {
  name: string;
  renderOrder: number;
  
  // 渲染前准备
  prepare(context: RenderContext): void;
  
  // 执行渲染
  execute(context: RenderContext): void;
  
  // 渲染后清理
  cleanup(context: RenderContext): void;
}

interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  renderTarget: WebGLRenderTarget | null;
}
```

### 3.2 Pass 管理器

```typescript
class PassManager {
  private passes: Map<string, RenderPass> = new Map();
  private sortedPasses: RenderPass[] = [];
  
  addPass(pass: RenderPass): void {
    this.passes.set(pass.name, pass);
    this.sortedPasses = Array.from(this.passes.values())
      .sort((a, b) => a.renderOrder - b.renderOrder);
  }
  
  render(context: RenderContext): void {
    for (const pass of this.sortedPasses) {
      pass.prepare(context);
      pass.execute(context);
      pass.cleanup(context);
    }
  }
}
```

### 3.3 地球引擎 Pass 实现

```typescript
class GlobePassManager extends PassManager {
  constructor() {
    super();
    
    // 按渲染顺序添加 Pass
    this.addPass(new EnvironmentPass());      // 星空、大气
    this.addPass(new TerrainPass());          // 地形
    this.addPass(new ImageryPass());          // 影像
    this.addPass(new VectorTilePass());       // 矢量瓦片
    this.addPass(new OverlayPass());          // 标注、UI
  }
}
```

---

## 4. Framebuffer 管理

### 4.1 RenderTarget 创建

```typescript
class RenderTargetManager {
  private targets: Map<string, WebGLRenderTarget> = new Map();
  
  create(
    name: string,
    width: number,
    height: number,
    options: RenderTargetOptions = {}
  ): WebGLRenderTarget {
    const target = new WebGLRenderTarget(width, height, {
      minFilter: options.minFilter || LinearFilter,
      magFilter: options.magFilter || LinearFilter,
      format: options.format || RGBAFormat,
      type: options.type || UnsignedByteType,
      depthBuffer: options.depthBuffer !== false,
      stencilBuffer: options.stencilBuffer || false
    });
    
    this.targets.set(name, target);
    return target;
  }
  
  get(name: string): WebGLRenderTarget | undefined {
    return this.targets.get(name);
  }
  
  dispose(name: string): void {
    const target = this.targets.get(name);
    if (target) {
      target.dispose();
      this.targets.delete(name);
    }
  }
  
  disposeAll(): void {
    for (const [name, target] of this.targets) {
      target.dispose();
    }
    this.targets.clear();
  }
}
```

### 4.2 多 Pass 渲染

```typescript
class MultiPassRenderer {
  private renderTargetManager: RenderTargetManager;
  
  renderWithPostProcessing(
    scene: Scene,
    camera: Camera,
    effects: PostProcessingEffect[]
  ): void {
    // 1. 渲染到中间 RenderTarget
    const sceneTarget = this.renderTargetManager.create('scene', width, height);
    this.renderer.setRenderTarget(sceneTarget);
    this.renderer.render(scene, camera);
    
    // 2. 应用后处理效果
    let currentTarget = sceneTarget;
    for (const effect of effects) {
      const outputTarget = this.renderTargetManager.create(
        `effect_${effect.name}`,
        width,
        height
      );
      
      effect.apply(currentTarget, outputTarget);
      currentTarget = outputTarget;
    }
    
    // 3. 渲染到屏幕
    this.renderer.setRenderTarget(null);
    this.renderer.render(currentTarget.quad, currentTarget.camera);
  }
}
```

---

## 5. 多Pass内存优化

### 5.1 内存消耗来源

| 来源 | 单Pass | 多Pass | 优化空间 |
|------|--------|--------|----------|
| RenderTarget | 0 | N个 | 复用、压缩 |
| 深度缓冲 | 1个 | N个 | 共享 |
| 颜色缓冲 | 1个 | N个 | 复用、降分辨率 |
| 状态对象 | 少量 | 大量 | 缓存 |

### 5.2 RenderTarget 复用池

```typescript
class RenderTargetPool {
  private pool: Map<string, WebGLRenderTarget[]> = new Map();
  private active: Set<WebGLRenderTarget> = new Set();
  
  acquire(width: number, height: number, options: RenderTargetOptions = {}): WebGLRenderTarget {
    const key = this.getKey(width, height, options);
    
    // 从池中获取
    const pool = this.pool.get(key);
    if (pool && pool.length > 0) {
      const target = pool.pop()!;
      this.active.add(target);
      return target;
    }
    
    // 创建新的
    const target = new WebGLRenderTarget(width, height, options);
    this.active.add(target);
    return target;
  }
  
  release(target: WebGLRenderTarget): void {
    if (!this.active.has(target)) return;
    
    this.active.delete(target);
    
    const key = this.getKey(target.width, target.height, {
      format: target.texture.format,
      type: target.texture.type
    });
    
    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }
    
    // 限制池大小
    const pool = this.pool.get(key)!;
    if (pool.length < 3) {
      pool.push(target);
    } else {
      target.dispose();
    }
  }
  
  private getKey(width: number, height: number, options: RenderTargetOptions): string {
    return `${width}x${height}_${options.format}_${options.type}`;
  }
  
  dispose(): void {
    for (const pool of this.pool.values()) {
      for (const target of pool) {
        target.dispose();
      }
    }
    this.pool.clear();
    
    for (const target of this.active) {
      target.dispose();
    }
    this.active.clear();
  }
}
```

### 5.3 动态分辨率

```typescript
class DynamicResolution {
  private scale: number = 1.0;
  private targetFPS: number = 60;
  private minScale: number = 0.5;
  private maxScale: number = 1.0;
  
  update(currentFPS: number): void {
    if (currentFPS < this.targetFPS * 0.9) {
      // 帧率过低，降低分辨率
      this.scale = Math.max(this.minScale, this.scale - 0.05);
    } else if (currentFPS > this.targetFPS * 1.1) {
      // 帧率过高，提高分辨率
      this.scale = Math.min(this.maxScale, this.scale + 0.02);
    }
  }
  
  getScaledSize(width: number, height: number): { width: number; height: number } {
    return {
      width: Math.floor(width * this.scale),
      height: Math.floor(height * this.scale)
    };
  }
}

// 使用示例
const { width, height } = dynamicResolution.getScaledSize(
  window.innerWidth,
  window.innerHeight
);

const target = renderTargetPool.acquire(width, height);
```

### 5.4 Pass 合并

```typescript
// 不好的做法：每个效果一个 Pass
class BadPostProcessing {
  render(): void {
    const bloom = this.renderBloom(scene);      // Pass 1
    const dof = this.renderDOF(bloom);          // Pass 2
    const fxaa = this.renderFXAA(dof);          // Pass 3
    const tonemap = this.renderTonemap(fxaa);   // Pass 4
  }
}

// 好的做法：合并可合并的 Pass
class GoodPostProcessing {
  render(): void {
    // Pass 1: 场景渲染
    const sceneTarget = this.renderScene();
    
    // Pass 2: 合并后处理（DOF + Bloom）
    const combinedTarget = this.renderCombinedEffects(sceneTarget);
    
    // Pass 3: 最终处理（FXAA + Tonemap）
    this.renderFinal(combinedTarget);
  }
  
  private renderCombinedEffects(input: WebGLRenderTarget): WebGLRenderTarget {
    // 在一个 Pass 中执行多个效果
    const shader = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: input.texture },
        bloomStrength: { value: 0.5 },
        dofFocus: { value: 10.0 }
      },
      vertexShader: combinedVertexShader,
      fragmentShader: combinedFragmentShader  // 包含 DOF + Bloom
    });
    
    this.quad.material = shader;
    this.renderer.render(this.quad, this.orthoCamera);
    
    return this.outputTarget;
  }
}
```

### 5.5 深度缓冲共享

```typescript
class SharedDepthBuffer {
  private depthTarget: WebGLRenderTarget;
  
  constructor(width: number, height: number) {
    // 创建共享深度缓冲
    this.depthTarget = new WebGLRenderTarget(width, height, {
      format: DepthFormat,
      type: UnsignedIntType,
      depthBuffer: true,
      stencilBuffer: true
    });
  }
  
  renderWithSharedDepth(
    passes: RenderPass[],
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera
  ): void {
    for (const pass of passes) {
      // 共享深度缓冲，避免重复创建
      pass.render(renderer, scene, camera, this.depthTarget.depthBuffer);
    }
  }
}
```

### 5.6 MRT（Multiple Render Targets）

```typescript
// 使用 MRT 在一次渲染中输出多个缓冲
class MRTRenderer {
  private mrtTarget: WebGLMultipleRenderTargets;
  
  constructor(width: number, height: number) {
    // 创建 MRT 目标（颜色 + 法线 + 深度）
    this.mrtTarget = new WebGLMultipleRenderTargets(width, height, 3);
  }
  
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // 一次渲染输出多个缓冲
    renderer.setRenderTarget(this.mrtTarget);
    renderer.render(scene, camera);
    
    // 使用输出
    const colorBuffer = this.mrtTarget.texture[0];
    const normalBuffer = this.mrtTarget.texture[1];
    const depthBuffer = this.mrtTarget.texture[2];
  }
}

// MRT 着色器
const mrtFragmentShader = `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outDepth;

void main() {
  outColor = vec4(color, 1.0);
  outNormal = vec4(normal * 0.5 + 0.5, 1.0);
  outDepth = vec4(vec3(gl_FragCoord.z), 1.0);
}
`;
```

### 5.7 按需 Pass

```typescript
class OnDemandPassManager {
  private passes: Map<string, RenderPass> = new Map();
  private enabledPasses: Set<string> = new Set();
  
  enablePass(name: string): void {
    this.enabledPasses.add(name);
  }
  
  disablePass(name: string): void {
    this.enabledPasses.delete(name);
  }
  
  render(context: RenderContext): void {
    // 只执行启用的 Pass
    for (const [name, pass] of this.passes) {
      if (this.enabledPasses.has(name)) {
        pass.execute(context);
      }
    }
  }
}

// 使用示例
const passManager = new OnDemandPassManager();

// 根据需要启用/禁用 Pass
if (needsBloom) {
  passManager.enablePass('bloom');
} else {
  passManager.disablePass('bloom');
}

if (needsDOF) {
  passManager.enablePass('dof');
} else {
  passManager.disablePass('dof');
}
```

### 5.8 压缩纹理格式

```typescript
class CompressedRenderTarget {
  static create(
    width: number,
    height: number,
    renderer: WebGLRenderer
  ): WebGLRenderTarget {
    const gl = renderer.getContext();
    
    // 检测支持的压缩格式
    const hasHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    const hasFloat = gl.getExtension('WEBGL_color_buffer_float');
    
    let type: TextureDataType;
    let format:PixelFormat;
    
    if (hasHalfFloat) {
      // 使用半浮点（节省 50% 内存）
      type = HalfFloatType;
      format = RGBAFormat;
    } else if (hasFloat) {
      type = FloatType;
      format = RGBAFormat;
    } else {
      type = UnsignedByteType;
      format = RGBAFormat;
    }
    
    return new WebGLRenderTarget(width, height, {
      format,
      type,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false
    });
  }
}
```

### 5.9 完整优化示例

```typescript
class OptimizedMultiPassRenderer {
  private pool: RenderTargetPool = new RenderTargetPool();
  private dynamicResolution: DynamicResolution = new DynamicResolution();
  private depthBuffer: SharedDepthBuffer;
  
  render(scene: Scene, camera: Camera): void {
    // 1. 计算动态分辨率
    const { width, height } = this.dynamicResolution.getScaledSize(
      window.innerWidth,
      window.innerHeight
    );
    
    // 2. Pass 1: 场景渲染（使用池化 RenderTarget）
    const sceneTarget = this.pool.acquire(width, height, {
      format: RGBAFormat,
      type: HalfFloatType  // 节省内存
    });
    
    this.renderer.setRenderTarget(sceneTarget);
    this.renderer.render(scene, camera);
    
    // 3. Pass 2: 合并后处理
    const outputTarget = this.pool.acquire(width, height);
    this.renderCombinedPostProcessing(sceneTarget, outputTarget);
    
    // 4. Pass 3: 最终输出
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quad, this.orthoCamera);
    
    // 5. 归还 RenderTarget 到池中
    this.pool.release(sceneTarget);
    this.pool.release(outputTarget);
  }
  
  dispose(): void {
    this.pool.dispose();
  }
}
```

### 5.10 内存监控

```typescript
class MemoryMonitor {
  private renderer: WebGLRenderer;
  private renderTargets: Set<WebGLRenderTarget> = new Set();
  
  track(target: WebGLRenderTarget): void {
    this.renderTargets.add(target);
  }
  
  untrack(target: WebGLRenderTarget): void {
    this.renderTargets.delete(target);
  }
  
  getStats(): MemoryStats {
    let totalPixels = 0;
    let bytesPerPixel = 4;  // RGBA8
    
    for (const target of this.renderTargets) {
      totalPixels += target.width * target.height;
    }
    
    return {
      renderTargetCount: this.renderTargets.size,
      totalPixels,
      estimatedMemoryMB: (totalPixels * bytesPerPixel) / (1024 * 1024)
    };
  }
  
  log(): void {
    const stats = this.getStats();
    console.log(`RenderTargets: ${stats.renderTargetCount}`);
    console.log(`Total Pixels: ${stats.totalPixels.toLocaleString()}`);
    console.log(`Estimated Memory: ${stats.estimatedMemoryMB.toFixed(2)} MB`);
  }
}
```

### 5.11 优化效果对比

| 优化策略 | 内存节省 | 性能影响 | 复杂度 |
|----------|----------|----------|--------|
| RenderTarget 复用 | 30-50% | 无 | 低 |
| 动态分辨率 | 25-75% | 有（画质降低） | 中 |
| Pass 合并 | 20-40% | 可能提升 | 中 |
| MRT | 30-50% | 提升 | 高 |
| 压缩纹理 | 50% | 无 | 低 |
| 深度共享 | 20-30% | 无 | 低 |
| 按需 Pass | 0-100% | 提升 | 低 |

### 5.12 最佳实践

```typescript
// 1. 使用池化
const renderTargetPool = new RenderTargetPool();

// 2. 动态分辨率
const dynamicResolution = new DynamicResolution();

// 3. 合并 Pass
class CombinedPostProcessingPass {
  // 在一个 Pass 中执行多个效果
}

// 4. 按需启用
if (distance > 10000) {
  passManager.disablePass('bloom');
  passManager.disablePass('dof');
}

// 5. 监控内存
memoryMonitor.log();
```

---

## 5. 渲染状态管理

### 5.1 状态封装

```typescript
interface RenderState {
  // 深度测试
  depthTest: boolean;
  depthWrite: boolean;
  depthFunc: DepthModes;
  
  // 混合
  blending: Blending;
  blendSrc: BlendingSrcFactor;
  blendDst: BlendingDstFactor;
  blendEquation: BlendingEquation;
  
  // 面剔除
  side: Side;
  
  // 模板测试
  stencilWriteMask: number;
  stencilFunc:StencilFunc;
  stencilRef: number;
  stencilFuncMask: number;
  stencilFail: StencilOp;
  stencilZFail: StencilOp;
  stencilZPass: StencilOp;
}
```

### 5.2 状态缓存

```typescript
class RenderStateCache {
  private currentState: RenderState | null = null;
  
  apply(state: RenderState): void {
    if (this.currentState === state) return;
    
    // 深度测试
    if (state.depthTest !== this.currentState?.depthTest) {
      this.gl.toggle(this.gl.DEPTH_TEST, state.depthTest);
    }
    
    if (state.depthWrite !== this.currentState?.depthWrite) {
      this.gl.depthMask(state.depthWrite);
    }
    
    if (state.depthFunc !== this.currentState?.depthFunc) {
      this.gl.depthFunc(state.depthFunc);
    }
    
    // 混合
    if (state.blending !== this.currentState?.blending) {
      this.gl.toggle(this.gl.BLEND, state.blending !== NoBlending);
    }
    
    this.currentState = state;
  }
  
  reset(): void {
    this.currentState = null;
  }
}
```

### 5.3 渲染排序

```typescript
class RenderSorter {
  sort(objects: RenderObject[]): RenderObject[] {
    return objects.sort((a, b) => {
      // 1. 按 renderOrder 排序
      if (a.renderOrder !== b.renderOrder) {
        return a.renderOrder - b.renderOrder;
      }
      
      // 2. 按材质排序（减少状态切换）
      if (a.material.id !== b.material.id) {
        return a.material.id - b.material.id;
      }
      
      // 3. 按距离排序（从远到近，用于半透明）
      if (a.material.transparent) {
        return b.distance - a.distance;
      }
      
      // 4. 按距离排序（从近到远，用于不透明）
      return a.distance - b.distance;
    });
  }
}
```

---

## 6. 批处理优化

### 6.1 材质批处理

```typescript
class MaterialBatcher {
  private batches: Map<number, RenderBatch> = new Map();
  
  addObject(object: RenderObject): void {
    const materialId = object.material.id;
    
    if (!this.batches.has(materialId)) {
      this.batches.set(materialId, new RenderBatch(object.material));
    }
    
    this.batches.get(materialId)!.add(object);
  }
  
  render(renderer: WebGLRenderer): void {
    for (const batch of this.batches.values()) {
      batch.render(renderer);
    }
  }
}

class RenderBatch {
  private material: Material;
  private geometry: BufferGeometry;
  private objects: RenderObject[] = [];
  
  constructor(material: Material) {
    this.material = material;
    this.geometry = new BufferGeometry();
  }
  
  add(object: RenderObject): void {
    this.objects.push(object);
    // 合并几何体
    this.mergeGeometry(object.geometry);
  }
  
  render(renderer: WebGLRenderer): void {
    // 一次绑定材质，一次绘制所有对象
    renderer.renderBufferDirect(
      camera,
      scene,
      this.geometry,
      this.material,
      this.mesh,
      null
    );
  }
}
```

### 6.2 实例化渲染

```typescript
class InstancedBatcher {
  private instancedMeshes: Map<string, InstancedMesh> = new Map();
  
  addObject(
    key: string,
    geometry: BufferGeometry,
    material: Material,
    matrix: Matrix4
  ): void {
    if (!this.instancedMeshes.has(key)) {
      const mesh = new InstancedMesh(geometry, material, 1000);
      this.instancedMeshes.set(key, mesh);
    }
    
    const mesh = this.instancedMeshes.get(key)!;
    mesh.setMatrixAt(mesh.count, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  
  render(renderer: WebGLRenderer, scene: Scene): void {
    for (const mesh of this.instancedMeshes.values()) {
      scene.add(mesh);
    }
    renderer.render(scene, camera);
  }
}
```

---

## 7. 渲染优化策略

### 7.1 视锥裁剪

```typescript
class FrustumCuller {
  private frustum = new Frustum();
  
  update(camera: Camera): void {
    const projScreenMatrix = new Matrix4();
    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(projScreenMatrix);
  }
  
  isVisible(object: Object3D): boolean {
    if (!object.visible) return false;
    
    if (object instanceof Mesh) {
      const geometry = object.geometry;
      
      if (geometry.boundingSphere === null) {
        geometry.computeBoundingSphere();
      }
      
      return this.frustum.intersectsSphere(geometry.boundingSphere);
    }
    
    return true;
  }
  
  cull(objects: Object3D[]): Object3D[] {
    return objects.filter(obj => this.isVisible(obj));
  }
}
```

### 7.2 遮挡剔除

```typescript
class OcclusionCuller {
  private queries: Map<string, WebGLQuery> = new Map();
  
  beginQuery(id: string): void {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('EXT_occlusion_query');
    
    if (!this.queries.has(id)) {
      this.queries.set(id, gl.createQuery());
    }
    
    const query = this.queries.get(id)!;
    ext.beginQueryEXT(ext.ANY_SAMPLES_PASSED_CONSERVATIVE_EXT, query);
  }
  
  endQuery(): void {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('EXT_occlusion_query');
    ext.endQueryEXT(ext.ANY_SAMPLES_PASSED_CONSERVATIVE_EXT);
  }
  
  isOccluded(id: string): boolean {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('EXT_occlusion_query');
    const query = this.queries.get(id);
    
    if (!query) return false;
    
    const available = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT);
    if (!available) return false;
    
    const result = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT);
    return result === 0;
  }
}
```

### 7.3 LOD 选择

```typescript
class LODSelector {
  selectLOD(object: Object3D, camera: Camera): LODLevel {
    const distance = camera.position.distanceTo(object.position);
    
    if (distance < 100) {
      return LODLevel.HIGH;
    } else if (distance < 1000) {
      return LODLevel.MEDIUM;
    } else {
      return LODLevel.LOW;
    }
  }
  
  updateLOD(objects: Object3D[], camera: Camera): void {
    for (const object of objects) {
      const level = this.selectLOD(object, camera);
      this.applyLOD(object, level);
    }
  }
}
```

---

## 8. 性能监控

### 8.1 渲染统计

```typescript
class RenderStats {
  drawCalls = 0;
  triangles = 0;
  points = 0;
  lines = 0;
  
  reset(): void {
    this.drawCalls = 0;
    this.triangles = 0;
    this.points = 0;
    this.lines = 0;
  }
  
  recordDrawCall(triangleCount: number): void {
    this.drawCalls++;
    this.triangles += triangleCount;
  }
}
```

### 8.2 GPU 计时

```typescript
class GPUTimer {
  private ext: any;
  private queries: Map<string, WebGLQuery> = new Map();
  
  constructor(renderer: WebGLRenderer) {
    const gl = renderer.getContext();
    this.ext = gl.getExtension('EXT_disjoint_timer_query');
  }
  
  begin(name: string): void {
    if (!this.ext) return;
    
    const gl = this.renderer.getContext();
    
    if (!this.queries.has(name)) {
      this.queries.set(name, gl.createQuery());
    }
    
    const query = this.queries.get(name)!;
    this.ext.beginQueryEXT(this.ext.TIME_ELAPSED_EXT, query);
  }
  
  end(): void {
    if (!this.ext) return;
    
    const gl = this.renderer.getContext();
    this.ext.endQueryEXT(this.ext.TIME_ELAPSED_EXT);
  }
  
  getResult(name: string): number | null {
    if (!this.ext) return null;
    
    const query = this.queries.get(name);
    if (!query) return null;
    
    const available = this.ext.getQueryObjectEXT(
      query,
      this.ext.QUERY_RESULT_AVAILABLE_EXT
    );
    
    if (!available) return null;
    
    const result = this.ext.getQueryObjectEXT(query, this.ext.QUERY_RESULT_EXT);
    return result / 1e6; // 转换为毫秒
  }
}
```

---

## 9. 验收清单

满足以下项可认为渲染管线达标：

1. [ ] Pass 化渲染实现，渲染顺序正确
2. [ ] Framebuffer 管理完整，无内存泄漏
3. [ ] 渲染状态缓存有效，减少状态切换
4. [ ] 批处理优化生效，draw call 数量减少
5. [ ] 视锥裁剪和遮挡剔除有效
6. [ ] 性能监控数据准确

---

## 10. 参考源码

- `src/core/PassManager.ts` - Pass 管理器
- `src/core/RenderTargetManager.ts` - RenderTarget 管理
- `src/core/RenderStateCache.ts` - 渲染状态缓存
- `src/core/RenderSorter.ts` - 渲染排序
- `src/core/FrustumCuller.ts` - 视锥裁剪

---

## 11. 下一步行动

1. 实现完整的 Pass 化渲染管线
2. 优化批处理和实例化渲染
3. 添加遮挡剔除支持
4. 完善性能监控