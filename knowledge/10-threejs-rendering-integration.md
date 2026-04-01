# 10 Three.js Rendering Integration

## 1. 目标与边界

本章解决将Cesium架构映射到Three.js的具体实现问题：

1. 如何将Cesium的四层架构（Scene/Globe/QuadtreePrimitive/GlobeSurfaceTileProvider）映射到Three.js
2. 如何处理Three.js与Cesium在渲染管线上的差异
3. 如何在Three.js中实现Cesium的pass化渲染

本章聚焦Three.js集成细节，不讨论着色器实现（见`11-custom-shaders-and-materials.md`）。

---

## 2. Cesium到Three.js的架构映射

### 2.1 核心对应关系

| Cesium概念 | Three.js实现 | 职责 |
|------------|--------------|------|
| `Scene` | `SceneSystem` + `WebGLRenderer` | 场景管理、渲染循环 |
| `Globe` | `GlobeEngine` | 引擎入口、参数管理 |
| `QuadtreePrimitive` | `SurfaceSystem` + `SurfaceTilePlanner` | LOD选择、瓦片管理 |
| `GlobeSurfaceTileProvider` | `TerrainTileLayer` + `RasterLayer` | 瓦片生产、渲染 |

### 2.2 关键差异处理

**Cesium的Command队列 vs Three.js的Scene图**：
- Cesium使用显式的DrawCommand队列，支持精细的渲染排序
- Three.js使用Scene图，需要通过renderOrder和depth控制排序

**解决方案**：
```typescript
// 在Three.js中模拟Cesium的pass化渲染
class RenderPassManager {
  private passes: Map<string, RenderPass> = new Map();
  
  addPass(name: string, pass: RenderPass): void {
    this.passes.set(name, pass);
  }
  
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // 按顺序执行各个pass
    for (const [name, pass] of this.passes) {
      pass.execute(renderer, scene, camera);
    }
  }
}
```

---

## 3. 渲染管线集成

### 3.1 Three.js渲染器配置

**关键配置项**：
```typescript
const renderer = new WebGLRenderer({
  antialias: true,      // 抗锯齿
  alpha: false,         // 不透明背景
  powerPreference: "high-performance"  // 高性能模式
});

// 色彩空间配置（关键）
renderer.outputColorSpace = SRGBColorSpace;

// 像素比限制（避免高DPI设备性能问题）
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
```

### 3.2 帧循环集成

**Cesium的帧循环**：
1. `Scene.update()`
2. `Globe.update()`
3. `QuadtreePrimitive.selectTilesForRendering()`
4. `GlobeSurfaceTileProvider.beginUpdate/endUpdate()`
5. `Scene.executeCommands()`

**Three.js的映射**：
```typescript
class FrameLoop {
  private needsRender = true;
  
  requestRender(): void {
    this.needsRender = true;
  }
  
  private tick(): void {
    if (this.needsRender) {
      this.update();
      this.render();
      this.needsRender = false;
    }
    requestAnimationFrame(() => this.tick());
  }
  
  private update(): void {
    // 1. 更新相机控制器
    this.cameraController.update();
    
    // 2. 更新Surface系统（相当于QuadtreePrimitive）
    this.surfaceSystem.update(this.camera);
    
    // 3. 更新图层
    this.layerManager.update(this.camera);
  }
  
  private render(): void {
    // 4. 执行渲染（相当于Scene.executeCommands）
    this.renderer.render(this.scene, this.camera);
  }
}
```

---

## 4. 相机系统转换

### 4.1 Cesium相机 vs Three.js相机

**Cesium相机特性**：
- 基于椭球体的地理坐标系
- 支持heading/pitch/roll欧拉角
- 自动处理地球曲率

**Three.js相机转换**：
```typescript
class CameraController {
  private camera: PerspectiveCamera;
  private target: Vector3 = new Vector3();
  
  setView({ lng, lat, altitude }: CameraView): void {
    // 1. 将经纬度转换为世界坐标
    const position = this.lngLatToWorld(lng, lat, altitude);
    
    // 2. 设置相机位置
    this.camera.position.copy(position);
    
    // 3. 计算相机朝向（看向地心）
    this.camera.lookAt(this.target);
  }
  
  private lngLatToWorld(lng: number, lat: number, altitude: number): Vector3 {
    // 使用椭球体公式转换
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    
    const radius = this.earthRadius + altitude;
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    return new Vector3(x, y, z);
  }
}
```

---

## 5. 材质系统适配

### 5.1 Cesium材质 vs Three.js材质

**Cesium材质特点**：
- 基于Fabric的着色器系统
- 支持动态材质组合
- 内置地球材质（如`EllipsoidSurfaceAppearance`）

**Three.js适配策略**：
```typescript
// 1. 使用MeshStandardMaterial作为基础
const globeMaterial = new MeshStandardMaterial({
  color: "#86a8ff",      // 基础颜色
  roughness: 0.95,       // 粗糙度
  metalness: 0.02,       // 金属度
  map: texture           // 纹理贴图
});

// 2. 支持动态纹理更新
class DynamicMaterial {
  private material: MeshStandardMaterial;
  
  updateTexture(texture: Texture): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }
}
```

---

## 6. Pass化渲染实现

### 6.1 Cesium的渲染Pass

Cesium的标准渲染顺序：
1. `environment`（天空/大气/星空）
2. `surface`（地形几何 + 影像颜色）
3. `overlay`（矢量、标注、模型）
4. `translucent / post`（半透明、后处理）

### 6.2 Three.js的实现

```typescript
class RenderPipeline {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  
  render(): void {
    // 1. 环境Pass（大气、星空）
    this.renderEnvironmentPass();
    
    // 2. 表面Pass（地形、影像）
    this.renderSurfacePass();
    
    // 3. 覆盖层Pass（矢量、标注）
    this.renderOverlayPass();
    
    // 4. 半透明Pass
    this.renderTranslucentPass();
  }
  
  private renderEnvironmentPass(): void {
    // 设置深度测试，但不写入深度
    this.renderer.state.buffers.depth.setMask(false);
    this.renderer.state.buffers.depth.setTest(false);
    
    // 渲染大气层、星空等
    this.renderer.render(this.environmentScene, this.camera);
    
    // 恢复深度设置
    this.renderer.state.buffers.depth.setMask(true);
    this.renderer.state.buffers.depth.setTest(true);
  }
}
```

---

## 7. 与当前three-map的映射

### 7.1 现有实现分析

**RendererSystem.ts**：
```typescript
export class RendererSystem {
  readonly renderer: WebGLRenderer;
  
  constructor({ container, clearColor = "#03060d" }: RendererSystemOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(clearColor);
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
  }
}
```

**AtmosphereMesh.ts**（环境Pass实现）：
```typescript
export class AtmosphereMesh {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  
  constructor(radius: number) {
    this.mesh = new Mesh(
      new SphereGeometry(radius * 1.035, 64, 48),
      new MeshBasicMaterial({
        color: "#5fb7ff",
        transparent: true,
        opacity: 0.18,
        side: BackSide,           // 背面渲染
        depthWrite: false,        // 不写入深度
        blending: AdditiveBlending  // 叠加混合
      })
    );
  }
}
```

### 7.2 改进建议

1. **显式Pass管理**：将渲染逻辑从GlobeEngine提取到RenderPipeline
2. **渲染状态管理**：统一管理深度、混合、模板等状态
3. **性能优化**：实现视锥裁剪、遮挡剔除等优化

---

## 8. 常见问题与解决方案

### 8.1 深度冲突（Z-fighting）

**问题**：地形瓦片之间出现闪烁

**原因**：瓦片深度值过于接近

**解决方案**：
```typescript
// 1. 使用PolygonOffset
material.polygonOffset = true;
material.polygonOffsetFactor = 1;
material.polygonOffsetUnits = 1;

// 2. 调整近远平面
camera.near = 0.1;
camera.far = 1000000;
```

### 8.2 性能问题

**问题**：大量瓦片导致帧率下降

**解决方案**：
```typescript
// 1. 使用实例化渲染
const instancedMesh = new InstancedMesh(geometry, material, count);

// 2. 实现LOD系统
class LODManager {
  private levels: Map<number, Mesh> = new Map();
  
  selectLOD(distance: number): Mesh {
    // 根据距离选择合适的LOD级别
  }
}

// 3. 视锥裁剪
class FrustumCuller {
  private frustum = new Frustum();
  
  isVisible(object: Object3D): boolean {
    return this.frustum.intersectsObject(object);
  }
}
```

---

## 9. 验收清单

满足以下项可认为Three.js集成达标：

1. [ ] 渲染器配置正确（色彩空间、像素比、抗锯齿）
2. [ ] 帧循环稳定，无内存泄漏
3. [ ] 相机系统支持地理坐标转换
4. [ ] 材质系统支持动态纹理更新
5. [ ] Pass化渲染实现，顺序正确
6. [ ] 无深度冲突或渲染错误
7. [ ] 性能满足60fps要求

---

## 10. 参考源码

- `src/core/RendererSystem.ts` - 渲染器配置
- `src/globe/AtmosphereMesh.ts` - 环境Pass实现
- `src/globe/GlobeMaterial.ts` - 材质系统
- `src/engine/GlobeEngine.ts` - 引擎集成
- `src/core/CameraController.ts` - 相机系统

---

## 11. 下一步行动

1. 实现显式RenderPipeline管理
2. 优化Pass化渲染性能
3. 添加更多渲染状态控制
4. 实现高级渲染技术（如延迟渲染）