# 21 Water Rendering

## 1. 目标与边界

本章解决水面渲染问题：

1. 如何实现海洋/湖泊水面效果
2. 如何实现水面反射和折射
3. 如何实现波浪和涟漪

本章聚焦水面渲染，不讨论地形生成。

---

## 2. 水面基础

### 2.1 水面类型

| 类型 | 特点 | 使用场景 |
|------|------|----------|
| 静态水面 | 无波纹，简单反射 | 远距离、小湖泊 |
| 动态水面 | 波浪、反射、折射 | 近距离、海洋 |
| 流体水面 | 物理模拟 | 游戏、特效 |

### 2.2 水面数据来源

```typescript
interface WaterSource {
  // GeoJSON 多边形
  type: 'polygon';
  coordinates: number[][][];
  
  // 或瓦片数据
  type: 'tile';
  url: string;
  
  // 高度（海平面）
  level: number;  // 默认 0
}
```

---

## 3. 静态水面

### 3.1 基础水面材质

```typescript
class WaterMaterial extends MeshStandardMaterial {
  constructor(options: WaterOptions = {}) {
    super({
      color: options.color ?? '#0077be',
      metalness: options.metalness ?? 0.9,
      roughness: options.roughness ?? 0.1,
      transparent: true,
      opacity: options.opacity ?? 0.8
    });
  }
}
```

### 3.2 水面网格生成

```typescript
class WaterMesh {
  private geometry: PlaneGeometry;
  private material: WaterMaterial;
  private mesh: Mesh;
  
  constructor(bounds: LngLatBounds, resolution: number = 64) {
    // 创建水面几何
    this.geometry = new PlaneGeometry(
      bounds.east - bounds.west,
      bounds.north - bounds.south,
      resolution,
      resolution
    );
    
    // 创建水面材质
    this.material = new WaterMaterial();
    
    // 创建网格
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;  // 水平放置
  }
  
  setPosition(lng: number, lat: number, altitude: number): void {
    // 转换为世界坐标
    const position = cartographicToCartesian(lng, lat, altitude);
    this.mesh.position.copy(position);
  }
}
```

### 3.3 使用示例

```typescript
const waterLayer = new WaterLayer('lakes');
engine.addLayer(waterLayer);

// 添加湖泊
waterLayer.addWater({
  id: 'lake-1',
  type: 'polygon',
  coordinates: [
    [116.0, 40.0],
    [117.0, 40.0],
    [117.0, 39.0],
    [116.0, 39.0],
    [116.0, 40.0]
  ],
  level: 0,  // 海平面
  color: '#0077be',
  opacity: 0.8
});
```

---

## 4. 动态水面

### 4.1 法线贴图波浪

```glsl
// 水面顶点着色器
uniform float time;
uniform sampler2D normalMap;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  
  // 波浪位移
  vec3 pos = position;
  float wave = sin(pos.x * 0.1 + time) * cos(pos.y * 0.1 + time) * 0.5;
  pos.z += wave;
  
  // 计算世界坐标
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  
  // 采样法线贴图
  vec3 normal = texture2D(normalMap, vUv + time * 0.05).xyz * 2.0 - 1.0;
  vNormal = normalize(normalMatrix * normal);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

// 水面片段着色器
uniform vec3 waterColor;
uniform vec3 skyColor;
uniform float time;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  
  // 菲涅尔效应
  float fresnel = pow(1.0 - dot(normal, viewDir), 3.0);
  
  // 反射
  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 reflection = skyColor;  // 简化：使用天空颜色
  
  // 折射
  vec3 refraction = waterColor;
  
  // 混合
  vec3 color = mix(refraction, reflection, fresnel);
  
  // 高光
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  vec3 halfDir = normalize(viewDir + lightDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), 128.0);
  color += vec3(1.0) * spec * 0.5;
  
  gl_FragColor = vec4(color, 0.9);
}
```

### 4.2 动态水面类

```typescript
class DynamicWaterMaterial extends ShaderMaterial {
  private normalMap: Texture;
  private time: number = 0;
  
  constructor(options: DynamicWaterOptions) {
    // 加载法线贴图
    const loader = new TextureLoader();
    this.normalMap = loader.load(options.normalMapUrl ?? 'water-normal.png');
    this.normalMap.wrapS = this.normalMap.wrapT = RepeatWrapping;
    
    super({
      uniforms: {
        time: { value: 0 },
        normalMap: { value: this.normalMap },
        waterColor: { value: new Color(options.waterColor ?? '#0077be') },
        skyColor: { value: new Color(options.skyColor ?? '#87ceeb') }
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: DoubleSide
    });
  }
  
  update(deltaTime: number): void {
    this.time += deltaTime;
    this.uniforms.time.value = this.time;
  }
}
```

### 4.3 使用示例

```typescript
const oceanLayer = new WaterLayer('ocean');
engine.addLayer(oceanLayer);

oceanLayer.addWater({
  id: 'ocean',
  type: 'polygon',
  coordinates: oceanBoundary,
  dynamic: true,
  normalMapUrl: '/textures/water-normal.png',
  waveHeight: 0.5,
  waveSpeed: 1.0,
  waterColor: '#0077be',
  skyColor: '#87ceeb'
});
```

---

## 5. 反射和折射

### 5.1 反射渲染

```typescript
class WaterReflection {
  private reflectionCamera: PerspectiveCamera;
  private reflectionTarget: WebGLRenderTarget;
  
  constructor(waterLevel: number) {
    // 创建反射相机（水面下方）
    this.reflectionCamera = new PerspectiveCamera();
    
    // 创建反射渲染目标
    this.reflectionTarget = new WebGLRenderTarget(1024, 1024);
  }
  
  update(mainCamera: Camera, waterLevel: number): void {
    // 翻转相机到水面下方
    this.reflectionCamera.copy(mainCamera);
    this.reflectionCamera.position.y = 2 * waterLevel - mainCamera.position.y;
    this.reflectionCamera.lookAt(0, waterLevel, 0);
    
    // 裁剪平面（只渲染水面上方）
    const clipPlane = new Vector4(0, 1, 0, -waterLevel);
    this.setClipPlane(clipPlane);
  }
  
  render(renderer: WebGLRenderer, scene: Scene): void {
    renderer.setRenderTarget(this.reflectionTarget);
    renderer.render(scene, this.reflectionCamera);
    renderer.setRenderTarget(null);
  }
  
  getTexture(): Texture {
    return this.reflectionTarget.texture;
  }
}
```

### 5.2 折射渲染

```typescript
class WaterRefraction {
  private refractionTarget: WebGLRenderTarget;
  
  constructor() {
    this.refractionTarget = new WebGLRenderTarget(1024, 1024);
  }
  
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // 裁剪平面（只渲染水面下方）
    const clipPlane = new Vector4(0, -1, 0, waterLevel);
    this.setClipPlane(clipPlane);
    
    renderer.setRenderTarget(this.refractionTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }
  
  getTexture(): Texture {
    return this.refractionTarget.texture;
  }
}
```

### 5.3 完整水面渲染

```typescript
class WaterRenderer {
  private reflection: WaterReflection;
  private refraction: WaterRefraction;
  private material: ShaderMaterial;
  
  constructor(waterLevel: number) {
    this.reflection = new WaterReflection(waterLevel);
    this.refraction = new WaterRefraction();
    
    this.material = new ShaderMaterial({
      uniforms: {
        reflectionMap: { value: this.reflection.getTexture() },
        refractionMap: { value: this.refraction.getTexture() },
        normalMap: { value: normalMap },
        time: { value: 0 }
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader
    });
  }
  
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // 1. 渲染反射
    this.reflection.update(camera, this.waterLevel);
    this.reflection.render(renderer, scene);
    
    // 2. 渲染折射
    this.refraction.render(renderer, scene, camera);
    
    // 3. 渲染水面
    renderer.render(this.waterMesh, camera);
  }
}
```

---

## 6. 波浪和涟漪

### 6.1 Gerstner 波浪

```glsl
// Gerstner 波浪公式
vec3 gerstnerWave(vec3 position, float time, vec4 wave) {
  // wave: (方向x, 方向y, 波长, 振幅)
  float steepness = wave.z;
  float wavelength = wave.w;
  
  float k = 2.0 * 3.14159 / wavelength;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(wave.xy);
  
  float f = k * (dot(d, position.xz) - c * time);
  float a = steepness / k;
  
  return vec3(
    d.x * a * cos(f),
    a * sin(f),
    d.y * a * cos(f)
  );
}

// 组合多个波浪
vec3 gerstnerWaves(vec3 position, float time) {
  vec3 p = position;
  
  // 波浪1：大波浪
  p += gerstnerWave(position, time, vec4(1.0, 0.0, 0.5, 60.0));
  
  // 波浪2：中波浪
  p += gerstnerWave(position, time, vec4(0.7, 0.7, 0.25, 31.0));
  
  // 波浪3：小波浪
  p += gerstnerWave(position, time, vec4(-0.2, 0.8, 0.15, 18.0));
  
  return p;
}
```

### 6.2 涟漪效果

```typescript
class RippleEffect {
  private ripples: Ripple[] = [];
  private maxRipples: number = 10;
  
  addRipple(x: number, y: number, strength: number = 1.0): void {
    if (this.ripples.length >= this.maxRipples) {
      this.ripples.shift();
    }
    
    this.ripples.push({
      x,
      y,
      strength,
      time: 0,
      duration: 2.0
    });
  }
  
  update(deltaTime: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].time += deltaTime;
      
      if (this.ripples[i].time > this.ripples[i].duration) {
        this.ripples.splice(i, 1);
      }
    }
  }
  
  getUniforms(): RippleUniforms {
    return {
      rippleCount: this.ripples.length,
      ripplePositions: this.ripples.map(r => [r.x, r.y]),
      rippleTimes: this.ripples.map(r => r.time),
      rippleStrengths: this.ripples.map(r => r.strength)
    };
  }
}
```

```glsl
// 涟漪顶点着色器
uniform int rippleCount;
uniform vec2 ripplePositions[10];
uniform float rippleTimes[10];
uniform float rippleStrengths[10];

vec3 applyRipples(vec3 position) {
  vec3 displacement = vec3(0.0);
  
  for (int i = 0; i < 10; i++) {
    if (i >= rippleCount) break;
    
    float distance = length(position.xz - ripplePositions[i]);
    float rippleRadius = rippleTimes[i] * 5.0;
    float rippleWidth = 2.0;
    
    // 波纹衰减
    float ripple = sin((distance - rippleRadius) * 3.14159 / rippleWidth);
    float decay = exp(-distance * 0.1) * exp(-rippleTimes[i] * 0.5);
    
    displacement.y += ripple * rippleStrengths[i] * decay * 0.5;
  }
  
  return position + displacement;
}
```

### 6.3 点击产生涟漪

```typescript
engine.on('click', ({ pickResult }) => {
  if (pickResult?.type === 'globe') {
    // 检查是否点击在水面上
    if (isWater(pickResult.cartographic)) {
      waterLayer.addRipple(
        pickResult.cartographic.lng,
        pickResult.cartographic.lat
      );
    }
  }
});
```

---

## 7. 海岸线混合

### 7.1 海岸线检测

```typescript
class CoastlineDetector {
  detectCoastline(terrainData: Float32Array, waterLevel: number): Edge[] {
    const edges: Edge[] = [];
    
    // 遍历地形数据
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const h00 = terrainData[y * width + x];
        const h10 = terrainData[y * width + x + 1];
        const h01 = terrainData[(y + 1) * width + x];
        
        // 检测水面边界
        if ((h00 < waterLevel) !== (h10 < waterLevel)) {
          edges.push({ x, y, direction: 'horizontal' });
        }
        if ((h00 < waterLevel) !== (h01 < waterLevel)) {
          edges.push({ x, y, direction: 'vertical' });
        }
      }
    }
    
    return edges;
  }
}
```

### 7.2 海岸线混合着色器

```glsl
// 海岸线混合
uniform sampler2D terrainTexture;
uniform sampler2D waterTexture;
uniform float waterLevel;

varying float vElevation;

void main() {
  // 检查是否在水面以下
  if (vElevation < waterLevel) {
    // 水面材质
    vec4 water = texture2D(waterTexture, vUv);
    
    // 海岸线混合
    float blendRange = 2.0;  // 混合范围（米）
    float blend = smoothstep(waterLevel - blendRange, waterLevel, vElevation);
    
    vec4 terrain = texture2D(terrainTexture, vUv);
    gl_FragColor = mix(water, terrain, blend);
  } else {
    // 地形材质
    gl_FragColor = texture2D(terrainTexture, vUv);
  }
}
```

---

## 8. 完整示例

```typescript
import { WaterLayer, DynamicWaterMaterial } from '@three-map/core';

// 1. 创建水面图层
const waterLayer = new WaterLayer('water');
engine.addLayer(waterLayer);

// 2. 添加海洋
waterLayer.addWater({
  id: 'ocean',
  type: 'tile',
  url: '/data/ocean-boundaries.pbf',
  level: 0,
  dynamic: true,
  normalMapUrl: '/textures/water-normal.png',
  waveHeight: 0.3,
  waveSpeed: 1.0,
  waterColor: '#0077be',
  skyColor: '#87ceeb'
});

// 3. 添加湖泊
waterLayer.addWater({
  id: 'lake-1',
  type: 'polygon',
  coordinates: lakeBoundary,
  level: 500,  // 海拔 500 米
  color: '#3498db',
  opacity: 0.9
});

// 4. 监听点击产生涟漪
engine.on('click', ({ pickResult }) => {
  if (isWaterPosition(pickResult.cartographic)) {
    waterLayer.addRipple(
      pickResult.cartographic.lng,
      pickResult.cartographic.lat,
      1.0
    );
  }
});

// 5. 每帧更新
engine.on('frame', ({ deltaTime }) => {
  waterLayer.update(deltaTime);
});
```

---

## 9. 性能优化

### 9.1 LOD 水面

```typescript
class WaterLOD {
  selectLOD(distance: number): WaterLODLevel {
    if (distance > 100000) {
      // 远距离：静态水面
      return { type: 'static', resolution: 32 };
    } else if (distance > 10000) {
      // 中距离：简单波浪
      return { type: 'dynamic', resolution: 64, waveCount: 2 };
    } else {
      // 近距离：完整效果
      return { type: 'dynamic', resolution: 128, waveCount: 4, reflection: true };
    }
  }
}
```

### 9.2 视锥裁剪

```typescript
class WaterCuller {
  isVisible(water: WaterMesh, camera: Camera): boolean {
    // 检查水面是否在视锥内
    const frustum = new Frustum();
    frustum.setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );
    
    return frustum.intersectsObject(water.mesh);
  }
}
```

---

## 10. 验收清单

满足以下项可认为水面渲染达标：

1. [ ] 水面颜色和透明度正确
2. [ ] 波浪效果自然
3. [ ] 反射和折射效果真实
4. [ ] 涟漪响应正常
5. [ ] 海岸线混合无明显接缝
6. [ ] 性能满足要求（60fps）

---

## 11. 参考源码

- `src/layers/WaterLayer.ts` - 水面图层
- `src/materials/WaterMaterial.ts` - 水面材质
- `src/effects/RippleEffect.ts` - 涟漪效果

---

## 12. 下一步行动

1. 优化波浪性能
2. 添加水下效果
3. 实现流体模拟
4. 完善海岸线检测