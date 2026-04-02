# 20 Atmosphere and Lighting

## 1. 目标与边界

本章解决大气和光照渲染问题：

1. 如何实现大气散射效果
2. 如何实现太阳光照
3. 如何实现阴影

本章聚焦大气和光照渲染，不讨论具体几何生成。

---

## 2. 大气散射

### 2.1 Rayleigh 散射

```glsl
// Rayleigh 散射系数
const vec3 rayleighBeta = vec3(5.8e-6, 13.5e-6, 33.1e-6);

// Rayleigh 相函数
float rayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

// Rayleigh 散射计算
vec3 rayleighScattering(
  vec3 viewDir,
  vec3 sunDir,
  float sunIntensity,
  float distance
) {
  float cosTheta = dot(viewDir, sunDir);
  float phase = rayleighPhase(cosTheta);
  
  // 光学深度
  float opticalDepth = exp(-distance * 1e-5);
  
  // 散射
  vec3 scatter = rayleighBeta * sunIntensity * phase * opticalDepth;
  
  return scatter;
}
```

### 2.2 Mie 散射

```glsl
// Mie 散射系数
const float mieBeta = 21e-6;
const float mieG = 0.76;

// Mie 相函数（Henyey-Greenstein）
float miePhase(float cosTheta) {
  float g2 = mieG * mieG;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * mieG * cosTheta, 1.5));
}

// Mie 散射计算
vec3 mieScattering(
  vec3 viewDir,
  vec3 sunDir,
  float sunIntensity,
  float distance
) {
  float cosTheta = dot(viewDir, sunDir);
  float phase = miePhase(cosTheta);
  
  // 光学深度
  float opticalDepth = exp(-distance * 1e-4);
  
  // 散射
  float scatter = mieBeta * sunIntensity * phase * opticalDepth;
  
  return vec3(scatter);
}
```

### 2.3 完整大气着色器

```glsl
// 大气层顶点着色器
varying vec3 vWorldPosition;
varying vec3 vNormal;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

// 大气层片段着色器
uniform vec3 sunDirection;
uniform float sunIntensity;
uniform vec3 cameraPosition;
uniform float atmosphereRadius;
uniform float planetRadius;

varying vec3 vWorldPosition;
varying vec3 vNormal;

const int NUM_SAMPLES = 16;
const float PI = 3.14159265359;

// Rayleigh 参数
const vec3 rayleighBeta = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float rayleighScaleHeight = 8000.0;

// Mie 参数
const float mieBeta = 21e-6;
const float mieScaleHeight = 1200.0;
const float mieG = 0.76;

// 相函数
float rayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

float miePhase(float cosTheta) {
  float g2 = mieG * mieG;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * mieG * cosTheta, 1.5));
}

// 光线-球体交点
vec2 raySphereIntersect(vec3 rayOrigin, vec3 rayDir, float radius) {
  float a = dot(rayDir, rayDir);
  float b = 2.0 * dot(rayOrigin, rayDir);
  float c = dot(rayOrigin, origin) - radius * radius;
  
  float discriminant = b * b - 4.0 * a * c;
  
  if (discriminant < 0.0) {
    return vec2(-1.0);
  }
  
  float sqrtD = sqrt(discriminant);
  return vec2(
    (-b - sqrtD) / (2.0 * a),
    (-b + sqrtD) / (2.0 * a)
  );
}

// 计算大气散射
vec3 calculateAtmosphere(vec3 rayOrigin, vec3 rayDir, vec3 sunDir) {
  // 光线与大气层交点
  vec2 atmosphereHit = raySphereIntersect(rayOrigin, rayDir, atmosphereRadius);
  
  if (atmosphereHit.x > atmosphereHit.y) {
    return vec3(0.0);
  }
  
  float segmentLength = atmosphereHit.y - atmosphereHit.x;
  float stepSize = segmentLength / float(NUM_SAMPLES);
  
  vec3 scatterRayleigh = vec3(0.0);
  vec3 scatterMie = vec3(0.0);
  
  float opticalDepthRayleigh = 0.0;
  float opticalDepthMie = 0.0;
  
  vec3 samplePos = rayOrigin + rayDir * atmosphereHit.x;
  
  for (int i = 0; i < NUM_SAMPLES; i++) {
    float height = length(samplePos) - planetRadius;
    
    float hr = exp(-height / rayleighScaleHeight) * stepSize;
    float hm = exp(-height / mieScaleHeight) * stepSize;
    
    opticalDepthRayleigh += hr;
    opticalDepthMie += hm;
    
    // 光线到太阳的光学深度
    vec2 sunHit = raySphereIntersect(samplePos, sunDir, atmosphereRadius);
    float sunStepSize = sunHit.y / float(NUM_SAMPLES);
    float sunOpticalDepthRayleigh = 0.0;
    float sunOpticalDepthMie = 0.0;
    
    vec3 sunSamplePos = samplePos;
    for (int j = 0; j < NUM_SAMPLES; j++) {
      float sunHeight = length(sunSamplePos) - planetRadius;
      sunOpticalDepthRayleigh += exp(-sunHeight / rayleighScaleHeight) * sunStepSize;
      sunOpticalDepthMie += exp(-sunHeight / mieScaleHeight) * sunStepSize;
      sunSamplePos += sunDir * sunStepSize;
    }
    
    vec3 tau = rayleighBeta * (opticalDepthRayleigh + sunOpticalDepthRayleigh) +
               vec3(mieBeta) * (opticalDepthMie + sunOpticalDepthMie) * 1.1;
    vec3 attenuation = exp(-tau);
    
    scatterRayleigh += attenuation * hr;
    scatterMie += attenuation * hm;
    
    samplePos += rayDir * stepSize;
  }
  
  float cosTheta = dot(rayDir, sunDir);
  
  vec3 color = sunIntensity * (
    rayleighBeta * rayleighPhase(cosTheta) * scatterRayleigh +
    vec3(mieBeta) * miePhase(cosTheta) * scatterMie
  );
  
  return color;
}

void main() {
  vec3 rayDir = normalize(vWorldPosition - cameraPosition);
  vec3 rayOrigin = cameraPosition;
  
  vec3 atmosphere = calculateAtmosphere(rayOrigin, rayDir, sunDirection);
  
  // Tone mapping
  atmosphere = 1.0 - exp(-atmosphere * 2.0);
  
  gl_FragColor = vec4(atmosphere, 1.0);
}
```

---

## 3. 太阳光照

### 3.1 太阳位置计算

```typescript
interface SunPosition {
  direction: Vector3;  // 太阳方向（单位向量）
  elevation: number;   // 太阳高度角（弧度）
  azimuth: number;     // 太阳方位角（弧度）
}

function calculateSunPosition(
  date: Date,
  latitude: number,
  longitude: number
): SunPosition {
  // 计算儒略日
  const julianDay = dateToJulianDay(date);
  
  // 计算太阳赤经和赤纬
  const solarCoordinates = calculateSolarCoordinates(julianDay);
  
  // 计算时角
  const hourAngle = calculateHourAngle(julianDay, longitude);
  
  // 计算高度角和方位角
  const elevation = Math.asin(
    Math.sin(latitude) * Math.sin(solarCoordinates.declination) +
    Math.cos(latitude) * Math.cos(solarCoordinates.declination) * Math.cos(hourAngle)
  );
  
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(solarCoordinates.declination) * Math.cos(latitude) -
    Math.sin(latitude) * Math.cos(hourAngle)
  );
  
  // 太阳方向向量
  const direction = new Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth)
  ).normalize();
  
  return { direction, elevation, azimuth };
}

function dateToJulianDay(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const min = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  
  let jdn = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 +
            Math.floor(y2 / 4) - Math.floor(y2 / 100) +
            Math.floor(y2 / 400) - 32045;
  
  const jd = jdn + (h - 12) / 24 + min / 1440 + s / 86400;
  
  return jd;
}
```

### 3.2 太阳光照着色器

```glsl
// 太阳光照片段着色器
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform vec3 ambientColor;
uniform float ambientIntensity;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vNormal);
  
  // 漫反射
  float NdotL = max(dot(normal, sunDirection), 0.0);
  vec3 diffuse = sunColor * sunIntensity * NdotL;
  
  // 环境光
  vec3 ambient = ambientColor * ambientIntensity;
  
  // 最终颜色
  vec3 finalColor = diffuse + ambient;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
```

---

## 4. 阴影渲染

### 4.1 阴影贴图

```typescript
class ShadowMap {
  private shadowCamera: OrthographicCamera;
  private shadowRenderTarget: WebGLRenderTarget;
  private shadowMaterial: ShaderMaterial;
  
  constructor(width: number = 2048, height: number = 2048) {
    // 阴影相机
    this.shadowCamera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    
    // 渲染目标
    this.shadowRenderTarget = new WebGLRenderTarget(width, height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat
    });
    
    // 阴影材质
    this.shadowMaterial = new ShaderMaterial({
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          // 存储深度
          gl_FragColor = vec4(gl_FragCoord.z);
        }
      `
    });
  }
  
  // 更新阴影相机
  update(sunDirection: Vector3, sceneBounds: Box3): void {
    // 计算阴影相机位置
    const center = sceneBounds.getCenter(new Vector3());
    const size = sceneBounds.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    this.shadowCamera.position.copy(center);
    this.shadowCamera.position.add(sunDirection.clone().multiplyScalar(maxDim * 2));
    this.shadowCamera.lookAt(center);
    
    this.shadowCamera.left = -maxDim;
    this.shadowCamera.right = maxDim;
    this.shadowCamera.top = maxDim;
    this.shadowCamera.bottom = -maxDim;
    this.shadowCamera.near = 0.1;
    this.shadowCamera.far = maxDim * 4;
    
    this.shadowCamera.updateProjectionMatrix();
  }
  
  // 渲染阴影贴图
  render(renderer: WebGLRenderer, scene: Scene): void {
    renderer.setRenderTarget(this.shadowRenderTarget);
    renderer.render(scene, this.shadowCamera);
    renderer.setRenderTarget(null);
  }
  
  getShadowMatrix(): Matrix4 {
    // 偏移矩阵
    const biasMatrix = new Matrix4(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    
    return biasMatrix.multiply(this.shadowCamera.projectionMatrix)
                     .multiply(this.shadowCamera.matrixWorldInverse);
  }
}
```

### 4.2 阴影着色器

```glsl
// 阴影着色器
uniform sampler2D shadowMap;
uniform mat4 shadowMatrix;
uniform float shadowBias;

varying vec3 vWorldPosition;

float calculateShadow(vec3 worldPosition) {
  // 变换到阴影空间
  vec4 shadowCoord = shadowMatrix * vec4(worldPosition, 1.0);
  shadowCoord.xyz /= shadowCoord.w;
  
  // 采样阴影贴图
  float shadowDepth = texture2D(shadowMap, shadowCoord.xy).r;
  
  // 比较深度
  float currentDepth = shadowCoord.z;
  float shadow = currentDepth - shadowBias > shadowDepth ? 0.0 : 1.0;
  
  return shadow;
}

// PCF 软阴影
float calculateSoftShadow(vec3 worldPosition) {
  vec4 shadowCoord = shadowMatrix * vec4(worldPosition, 1.0);
  shadowCoord.xyz /= shadowCoord.w;
  
  float shadow = 0.0;
  float texelSize = 1.0 / 2048.0;
  
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * texelSize;
      float shadowDepth = texture2D(shadowMap, shadowCoord.xy + offset).r;
      float currentDepth = shadowCoord.z;
      shadow += currentDepth - shadowBias > shadowDepth ? 0.0 : 1.0;
    }
  }
  
  return shadow / 9.0;
}
```

---

## 5. 环境光遮蔽 (AO)

### 5.1 SSAO

```glsl
// SSAO 顶点着色器
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// SSAO 片段着色器
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform float radius;
uniform float bias;

varying vec2 vUv;

const int KERNEL_SIZE = 16;
const float PI = 3.14159265359;

// 随机采样核
vec3 sampleKernel[KERNEL_SIZE] = vec3[](
  vec3(0.0297, 0.0215, 0.0177),
  vec3(-0.0281, 0.0472, 0.0313),
  // ... 更多采样点
);

// 随机旋转
float random(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  
  // 重建位置
  vec4 clipPos = vec4(vUv * 2.0 - 1.0, depth, 1.0);
  vec4 viewPos = inverseProjectionMatrix * clipPos;
  viewPos /= viewPos.w;
  
  float occlusion = 0.0;
  float rotation = random(vUv) * PI * 2.0;
  
  for (int i = 0; i < KERNEL_SIZE; i++) {
    // 旋转采样核
    vec3 sampleDir = sampleKernel[i];
    sampleDir.xz = vec2(
      sampleDir.x * cos(rotation) - sampleDir.z * sin(rotation),
      sampleDir.x * sin(rotation) + sampleDir.z * cos(rotation)
    );
    
    // 半球采样
    if (dot(sampleDir, normal) < 0.0) {
      sampleDir = -sampleDir;
    }
    
    vec3 samplePos = viewPos.xyz + sampleDir * radius;
    
    // 投影采样点
    vec4 sampleClip = projectionMatrix * vec4(samplePos, 1.0);
    vec2 sampleUV = (sampleClip.xy / sampleClip.w) * 0.5 + 0.5;
    
    // 采样深度
    float sampleDepth = texture2D(tDepth, sampleUV).r;
    float sampleLinearDepth = sampleDepth;
    
    // 范围检查
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(depth - sampleLinearDepth));
    
    // 遮蔽测试
    occlusion += (sampleLinearDepth >= samplePos.z + bias ? 1.0 : 0.0) * rangeCheck;
  }
  
  occlusion = 1.0 - (occlusion / float(KERNEL_SIZE));
  
  gl_FragColor = vec4(vec3(occlusion), 1.0);
}
```

---

## 6. 验收清单

满足以下项可认为大气和光照渲染达标：

1. [ ] 大气散射效果真实
2. [ ] 太阳位置计算正确
3. [ ] 光照效果自然
4. [ ] 阴影渲染正确
5. [ ] 性能满足要求

---

## 7. 参考源码

- `src/globe/AtmosphereMesh.ts` - 大气层网格
- `src/lighting/SunLight.ts` - 太阳光照
- `src/shadow/ShadowMap.ts` - 阴影贴图

---

## 8. 下一步行动

1. 优化大气散射性能
2. 添加日夜过渡效果
3. 实现体积云
4. 完善阴影系统