# 11 Custom Shaders and Materials

## 1. 目标与边界

本章解决Three.js中自定义着色器和材质的实现问题：

1. 如何在Three.js中创建和使用自定义着色器
2. 如何将Cesium的Fabric着色器系统迁移到Three.js
3. 如何优化着色器性能

本章聚焦着色器实现，不讨论渲染管线集成（见`10-threejs-rendering-integration.md`）。

---

## 2. Three.js着色器系统概述

### 2.1 着色器类型

**内置材质**：
- `MeshBasicMaterial` - 基础材质，无光照
- `MeshStandardMaterial` - PBR材质，支持光照
- `MeshPhongMaterial` - 高光材质

**自定义着色器**：
- `ShaderMaterial` - 完全自定义着色器
- `RawShaderMaterial` - 原始着色器，无内置uniforms

### 2.2 着色器编写位置

**方式1：字符串内嵌**（推荐用于简单着色器）
```typescript
const material = new ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(vUv, 0.0, 1.0);
    }
  `
});
```

**方式2：外部文件**（推荐用于复杂着色器）
```typescript
import vertexShader from './shaders/globe.vert';
import fragmentShader from './shaders/globe.frag';

const material = new ShaderMaterial({
  vertexShader,
  fragmentShader
});
```

---

## 3. GlobeMaterial着色器分析

### 3.1 现有实现

**GlobeMaterial.ts**：
```typescript
export function createGlobeMaterial({
  texture = null
}: GlobeMaterialOptions = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: "#86a8ff",
    roughness: 0.95,
    metalness: 0.02,
    map: texture
  });
}
```

**特点**：
- 使用Three.js内置的`MeshStandardMaterial`
- 支持PBR光照
- 支持纹理贴图

### 3.2 扩展建议

如果需要更复杂的效果，可以扩展为自定义着色器：

```typescript
class GlobeShaderMaterial extends ShaderMaterial {
  constructor(options: GlobeShaderOptions) {
    super({
      uniforms: {
        texture: { value: options.texture },
        time: { value: 0 },
        atmosphereColor: { value: new Color("#5fb7ff") }
      },
      vertexShader: globeVertexShader,
      fragmentShader: globeFragmentShader
    });
  }
  
  update(deltaTime: number): void {
    this.uniforms.time.value += deltaTime;
  }
}
```

---

## 4. 大气层着色器实现

### 4.1 现有实现分析

**AtmosphereMesh.ts**：
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
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending
      })
    );
  }
}
```

**关键技术**：
1. **背面渲染** (`BackSide`)：渲染球体内部，模拟大气层
2. **叠加混合** (`AdditiveBlending`)：与背景叠加
3. **不写入深度** (`depthWrite: false`)：避免遮挡其他物体

### 4.2 高级大气层着色器

**顶点着色器**：
```glsl
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**片段着色器**：
```glsl
uniform vec3 atmosphereColor;
uniform float atmosphereIntensity;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // 计算视角与法线的夹角
  vec3 viewDir = normalize(-vPosition);
  float intensity = pow(1.0 - dot(vNormal, viewDir), 2.0);
  
  // 应用大气层颜色
  vec3 color = atmosphereColor * intensity * atmosphereIntensity;
  
  gl_FragColor = vec4(color, intensity);
}
```

---

## 5. 自定义材质创建流程

### 5.1 基础流程

```typescript
class CustomMaterial extends ShaderMaterial {
  private uniforms: { [key: string]: IUniform };
  
  constructor(options: CustomMaterialOptions) {
    // 1. 定义uniforms
    const uniforms = {
      texture: { value: options.texture },
      color: { value: new Color(options.color) },
      opacity: { value: options.opacity }
    };
    
    // 2. 调用父类构造函数
    super({
      uniforms,
      vertexShader: options.vertexShader,
      fragmentShader: options.fragmentShader,
      transparent: options.transparent,
      side: options.side
    });
    
    this.uniforms = uniforms;
  }
  
  // 3. 更新方法
  updateTexture(texture: Texture): void {
    this.uniforms.texture.value = texture;
    this.needsUpdate = true;
  }
}
```

### 5.2 性能优化

**Uniform更新优化**：
```typescript
class OptimizedMaterial extends ShaderMaterial {
  private dirtyFlags: Set<string> = new Set();
  
  setUniform(name: string, value: any): void {
    if (this.uniforms[name].value !== value) {
      this.uniforms[name].value = value;
      this.dirtyFlags.add(name);
    }
  }
  
  update(): void {
    if (this.dirtyFlags.size > 0) {
      this.needsUpdate = true;
      this.dirtyFlags.clear();
    }
  }
}
```

---

## 6. 着色器调试技巧

### 6.1 常见问题

**问题1：着色器编译失败**
```typescript
// 检查着色器编译状态
const material = new ShaderMaterial({ ... });
if (material.program) {
  const gl = renderer.getContext();
  const shader = material.program.fragmentShader;
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
  }
}
```

**问题2：uniform未生效**
```typescript
// 确保uniform名称正确
console.log('Uniforms:', Object.keys(material.uniforms));

// 确保uniform值类型正确
material.uniforms.texture.value = texture;  // 必须是Texture对象
material.uniforms.color.value = new Color("#ff0000");  // 必须是Color对象
```

### 6.2 调试工具

**使用`ShaderMaterial`的`onBeforeCompile`**：
```typescript
const material = new MeshStandardMaterial();
material.onBeforeCompile = (shader) => {
  // 修改着色器代码
  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    'void main() {\n  // 自定义代码'
  );
};
```

---

## 7. 与Cesium材质的映射

### 7.1 Cesium Fabric着色器

Cesium使用Fabric系统定义材质：
```javascript
const material = new Cesium.Material({
  fabric: {
    type: 'Image',
    uniforms: {
      image: 'texture.png',
      repeat: { x: 1, y: 1 }
    }
  }
});
```

### 7.2 Three.js等效实现

```typescript
class FabricLikeMaterial extends ShaderMaterial {
  constructor(fabricDefinition: FabricDefinition) {
    // 解析Fabric定义
    const uniforms = this.parseUniforms(fabricDefinition.uniforms);
    const vertexShader = this.parseShader(fabricDefinition.vertexShader);
    const fragmentShader = this.parseShader(fabricDefinition.fragmentShader);
    
    super({
      uniforms,
      vertexShader,
      fragmentShader
    });
  }
  
  private parseUniforms(uniforms: any): { [key: string]: IUniform } {
    // 转换Fabric uniforms到Three.js uniforms
  }
}
```

---

## 8. 实际应用示例

### 8.1 地形高度着色器

```typescript
// 根据高度值着色
const terrainMaterial = new ShaderMaterial({
  uniforms: {
    minHeight: { value: -100 },
    maxHeight: { value: 8000 },
    lowColor: { value: new Color("#0000ff") },
    highColor: { value: new Color("#ff0000") }
  },
  vertexShader: `
    attribute float elevation;
    varying float vElevation;
    
    void main() {
      vElevation = elevation;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float minHeight;
    uniform float maxHeight;
    uniform vec3 lowColor;
    uniform vec3 highColor;
    
    varying float vElevation;
    
    void main() {
      float t = (vElevation - minHeight) / (maxHeight - minHeight);
      t = clamp(t, 0.0, 1.0);
      vec3 color = mix(lowColor, highColor, t);
      gl_FragColor = vec4(color, 1.0);
    }
  `
});
```

### 8.2 热力图着色器

```typescript
const heatmapMaterial = new ShaderMaterial({
  uniforms: {
    heatmapTexture: { value: heatmapTexture },
    colorRamp: { value: colorRampTexture }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D heatmapTexture;
    uniform sampler2D colorRamp;
    
    varying vec2 vUv;
    
    void main() {
      float intensity = texture2D(heatmapTexture, vUv).r;
      vec3 color = texture2D(colorRamp, vec2(intensity, 0.5)).rgb;
      gl_FragColor = vec4(color, intensity);
    }
  `
});
```

---

## 9. 性能优化建议

### 9.1 着色器优化

1. **减少分支**：避免在片段着色器中使用if/else
2. **使用内置函数**：如`mix`、`smoothstep`、`clamp`
3. **预计算**：在顶点着色器中计算，传递给片段着色器

### 9.2 Uniform优化

```typescript
// 不好的做法：每帧更新所有uniform
material.uniforms.time.value = performance.now();

// 好的做法：只更新变化的uniform
if (this.timeChanged) {
  material.uniforms.time.value = this.time;
  this.timeChanged = false;
}
```

---

## 10. 验收清单

满足以下项可认为着色器实现达标：

1. [ ] 着色器编译无错误
2. [ ] Uniform值正确传递
3. [ ] 渲染效果符合预期
4. [ ] 性能满足60fps要求
5. [ ] 支持动态更新
6. [ ] 代码可维护、可扩展

---

## 11. 参考源码

- `src/globe/GlobeMaterial.ts` - 基础材质实现
- `src/globe/AtmosphereMesh.ts` - 大气层着色器
- `src/layers/RasterLayer.ts` - 纹理着色器
- `src/layers/HeatmapLayer.ts` - 热力图着色器

---

## 12. 下一步行动

1. 实现更复杂的地球着色器（支持日夜交替、云层等）
2. 优化着色器性能（减少分支、预计算）
3. 添加更多着色器效果（如水面反射、地形阴影）