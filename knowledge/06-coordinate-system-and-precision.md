# 06 Coordinate System And Precision

## 1. 目标与边界

本章解决三类基础稳定性问题：

1. 坐标方向错误（东/西反向、画面镜像）
2. 高倍率视角抖动（float 精度不足）
3. 交互方向与地理方向不一致（上下左右语义错位）

本章聚焦“坐标主干 + 精度策略 + 验证闭环”，不讨论瓦片选择与调度策略。

---

## 2. Cesium 的坐标主干（统一语义）

Cesium 的主干是分层坐标，不是单一 `Vector3`：

1. `Cartographic`：经纬高（lon/lat/height）
2. `Cartesian3`：ECEF 世界坐标
3. 投影层：2D/CV 使用 Geographic/WebMercator
4. GPU 层：RTE/RTC 做高精度渲染

关键源码：

- `packages/engine/Source/Core/Cartographic.js`
- `packages/engine/Source/Core/Ellipsoid.js`
- `packages/engine/Source/Core/EncodedCartesian3.js`
- `packages/engine/Source/Core/Transforms.js`
- `packages/engine/Source/Shaders/Builtin/Functions/translateRelativeToEye.glsl`

---

## 3. 方向约定（必须写死的规范）

地球引擎需要固定一套不可漂移的方向约定：

1. 世界坐标右手系
2. ENU 局部坐标：`East / North / Up`
3. 视图交互语义：`上北下南左西右东`

一旦选定，不允许通过 CSS 或后处理再镜像修正。

原因：

- 镜像补丁只会掩盖映射错误
- 交互、拾取、瓦片索引和渲染会长期不一致

---

## 4. 经纬到 ECEF 的单向映射（禁止双向补丁）

正确做法：

1. `lng/lat` 先转弧度
2. 用椭球模型计算 ECEF（WGS84）
3. 一致地进入世界变换链

错误做法：

- 在中间层把 `x` 取负再用 `scaleX(-1)` 补偿
- 在相机输入层和渲染层各做一次“反向修正”

结果会造成：

- 东西方向错反复出现
- 代码路径分叉，回归难以收敛

---

## 5. 右手系迁移常见遗漏项

把旧坐标实现替换为右手系后，最常漏改的是：

1. 交互增量映射（drag/pan 的经纬增量符号）
2. 相机 yaw/pitch 与地理方位换算符号
3. 瓦片 x 方向索引增减规则
4. 拾取射线与地理转换函数中的轴向约定
5. 法线与切线基（ENU）构建的叉乘顺序

只改一处会出现“局部看似正确，整体仍镜像”的假象。

---

## 6. 输入交互方向的正规定义

推荐统一定义（地球正视图）：

- 向右拖动画面：中心经度减小（视图向西移）
- 向左拖动画面：中心经度增大（视图向东移）
- 向上拖动画面：中心纬度减小（视图向南移）
- 向下拖动画面：中心纬度增大（视图向北移）

注意：这是“拖动画面”的语义，不是“相机在世界里移动”的语义，必须统一为用户可感知方向。

---

## 7. 精度策略：RTE + RTC 双层

## 7.1 GPU RTE（Relative To Eye）

做法：

- CPU 将大坐标拆成 `high/low` 两部分
- shader 中做相机相对平移计算

作用：

- 抑制远距离大数减法导致的抖动

## 7.2 Tile RTC（Relative To Center）

做法：

- 每个 tile 以局部中心 `u_center3D` 为参考
- 顶点用局部小坐标存储

作用：

- 降低 tile 内顶点量级，减少边界抖动

结论：

- RTE 解决“全局大坐标”
- RTC 解决“tile 局部细节”
- 两者应叠加使用

---

## 8. 投影分支一致性（3D/2D/CV）

3D 与 2D/CV 可使用不同投影，但必须共享方向语义：

1. 经纬增减方向一致
2. 东西/南北判定一致
3. pick 结果回转 `Cartographic` 一致

如果 2D 分支单独反号，会在模式切换时出现方向跳变。

---

## 9. 与 three-map 的落地映射（干净实现）

遵循“不保留旧兼容代码”时，建议直接执行：

1. 删除所有视觉镜像补丁（例如 DOM `scaleX(-1)`）
2. 在 `geo/projection` 统一维护经纬->世界坐标链
3. 在 `CameraController` 统一维护拖拽方向映射
4. 在 surface/tiles 侧统一 x/y 索引与方向定义
5. 保持一条 ENU 构建路径，禁止多版本函数并存

强约束：

- 不允许“新坐标链 + 旧补丁”同时存在
- 不允许通过 UI 层 transform 掩盖内核坐标错误

---

## 10. 自动化回归清单（方向与精度）

建议最少覆盖：

1. 固定视角下，键盘/拖拽 `上下左右` 对应 `北南西东`
2. `lng` 增加时，地表特征向左移动（视图向东）
3. `lng` 减少时，地表特征向右移动（视图向西）
4. 高倍率俯视连续缩放，无明显顶点抖动
5. 模式切换（3D/2D/CV）后方向不翻转

---

## 11. 典型故障与归因

故障 1：画面左右反（东/西颠倒）  
归因：经纬->世界坐标链中某层轴符号错误，靠镜像补丁掩盖  
修复：移除补丁，逐层核对符号与叉乘顺序

故障 2：删除镜像后画面“看起来又反了”  
归因：交互层仍沿用旧符号，坐标层与输入层不一致  
修复：统一交互增量与地理语义

故障 3：高空抖动或地形边缘闪烁  
归因：仅用 float 世界坐标，无 RTE/RTC  
修复：引入 high/low 编码与 tile 局部中心

---

## 12. 对应 Cesium 参考源码

- `packages/engine/Source/Core/Cartographic.js`
- `packages/engine/Source/Core/Ellipsoid.js`
- `packages/engine/Source/Core/Transforms.js`
- `packages/engine/Source/Core/EncodedCartesian3.js`
- `packages/engine/Source/Shaders/Builtin/Functions/translateRelativeToEye.glsl`
- `packages/engine/Source/Shaders/GlobeVS.glsl`

建议阅读顺序：

1. 先看 `Cartographic` 与 `Ellipsoid` 的几何转换
2. 再看 `Transforms`（ENU/矩阵方向）
3. 最后看 shader 里的 RTE 计算链

---

## 14. 相机拉近时抖动问题详解（扩展）

### 14.1 抖动根源分析

**问题现象**：
- 相机高度 < 1000米时，地面纹理开始抖动
- 相机高度 < 100米时，抖动剧烈，几何顶点跳动
- 相机高度 < 10米时，画面完全不可用

**根本原因**：
```
地球半径 ≈ 6,371,000 米
相机高度 = 10 米
坐标量级差异 = 637,100 倍

float32 精度 ≈ 7位有效数字
当相机坐标为 6,371,010 米时：
- 整数部分占用 7位
- 小数部分精度仅 1米
- 10米以下的细节全部丢失
```

### 14.2 RTE（Relative To Eye）详解

**核心思想**：将世界坐标转换为相对于相机的坐标

```typescript
// CPU 端：编码双精度为两个 float32
class RTESystem {
  encodePosition(position: Cartesian3, eye: Cartesian3): EncodedPosition {
    // 相对坐标
    const relative = {
      x: position.x - eye.x,
      y: position.y - eye.y,
      z: position.z - eye.z
    };
    
    // 拆分为 high/low
    return {
      high: {
        x: Math.fround(relative.x),
        y: Math.fround(relative.y),
        z: Math.fround(relative.z)
      },
      low: {
        x: relative.x - Math.fround(relative.x),
        y: relative.y - Math.fround(relative.y),
        z: relative.z - Math.fround(relative.z)
      }
    };
  }
}
```

```glsl
// GPU 端：高精度重建
vec3 computeRTEPosition(vec3 positionHigh, vec3 positionLow, vec3 eyeHigh, vec3 eyeLow) {
  // Dekker 算法：高精度加法
  vec3 t1 = positionLow - eyeLow;
  vec3 e = t1 - positionLow;
  vec3 t2 = ((-eyeLow - e) + (positionLow - (t1 - e))) + positionHigh - eyeHigh;
  vec3 highDifference = t1 + t2;
  vec3 lowDifference = t2 - (highDifference - t1);
  
  return highDifference + lowDifference;
}
```

### 14.3 RTC（Relative To Center）详解

**核心思想**：每个瓦片以局部中心为参考，顶点使用小坐标

```typescript
class RTCSystem {
  // 计算瓦片中心
  computeTileCenter(tile: TileKey): Cartesian3 {
    const bounds = TileAddressing.tileToBounds(tile);
    const centerLng = (bounds.west + bounds.east) / 2;
    const centerLat = (bounds.south + bounds.north) / 2;
    
    return this.converter.cartographicToCartesian({
      longitude: centerLng,
      latitude: centerLat,
      height: 0
    });
  }
  
  // 将顶点转换为局部坐标
  computeLocalVertices(vertices: Cartesian3[], center: Cartesian3): Float32Array {
    const local = new Float32Array(vertices.length * 3);
    
    for (let i = 0; i < vertices.length; i++) {
      local[i * 3] = vertices[i].x - center.x;
      local[i * 3 + 1] = vertices[i].y - center.y;
      local[i * 3 + 2] = vertices[i].z - center.z;
    }
    
    return local;
  }
}
```

```glsl
// GPU 端：RTC 变换
uniform vec3 u_tileCenter;

void main() {
  vec3 worldPosition = u_tileCenter + localPosition;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
```

### 14.4 RTE + RTC 叠加使用

```glsl
// 完整的精度优化着色器
uniform vec3 u_eyeHigh;
uniform vec3 u_eyeLow;
uniform vec3 u_tileCenterHigh;
uniform vec3 u_tileCenterLow;

attribute vec3 a_positionLocal;

void main() {
  // 1. 局部坐标 -> 世界坐标（RTC）
  vec3 worldHigh = u_tileCenterHigh;
  vec3 worldLow = u_tileCenterLow + a_positionLocal;
  
  // 2. 世界坐标 -> 相机相对坐标（RTE）
  vec3 position = computeRTEPosition(worldHigh, worldLow, u_eyeHigh, u_eyeLow);
  
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
```

### 14.5 不同高度的精度表现

| 相机高度 | 精度要求 | 解决方案 |
|----------|----------|----------|
| > 100km | 低 | 标准 float32 即可 |
| 10-100km | 中 | 仅 RTE |
| 1-10km | 高 | RTE + RTC |
| 10-100m | 极高 | RTE + RTC + 局部坐标系 |
| < 10m | 极限 | 需要特殊处理（见下文） |

### 14.6 极端近距离处理（< 10米）

```typescript
class ExtremeProximityHandler {
  private camera: EllipsoidCamera;
  private localOrigin: Cartesian3 | null = null;
  
  // 切换到局部坐标系
  switchToLocalFrame(): void {
    const position = this.camera.getPosition();
    
    // 设置局部原点为相机当前位置
    this.localOrigin = cartographicToCartesian(
      this.ellipsoid,
      position
    );
    
    // 将场景所有对象转换为局部坐标
    this.rebuildSceneInLocalFrame(this.localOrigin);
  }
  
  // 更新局部原点（相机移动超过阈值时）
  updateLocalOrigin(): void {
    if (!this.localOrigin) return;
    
    const currentPosition = cartographicToCartesian(
      this.ellipsoid,
      this.camera.getPosition()
    );
    
    const distance = this.computeDistance(currentPosition, this.localOrigin);
    
    // 移动超过1km时重建局部坐标系
    if (distance > 1000) {
      this.switchToLocalFrame();
    }
  }
  
  private rebuildSceneInLocalFrame(origin: Cartesian3): void {
    // 重新计算所有瓦片的局部坐标
    for (const tile of this.visibleTiles) {
      const localVertices = this.computeLocalVertices(tile.vertices, origin);
      tile.updateGeometry(localVertices);
    }
  }
}
```

### 14.7 验收标准

满足以下项可认为精度处理达标：

1. [ ] 相机高度 100km 时，地面清晰无抖动
2. [ ] 相机高度 10km 时，地面细节清晰
3. [ ] 相机高度 1km 时，建筑物轮廓清晰
4. [ ] 相机高度 100m 时，地面纹理清晰无抖动
5. [ ] 相机高度 10m 时，地面仍然稳定（可能需要切换到局部坐标系）
6. [ ] 快速缩放时，无明显精度跳变

---

## 13. 椭球体建模详细实现（扩展）

### 13.1 WGS84 椭球体参数

```typescript
// WGS84 椭球体定义
const WGS84 = {
  // 长半轴（赤道半径）
  semiMajorAxis: 6378137.0,  // 米
  
  // 短半轴（极半径）
  semiMinorAxis: 6356752.314245,  // 米
  
  // 扁率
  flattening: 1 / 298.257223563,
  
  // 离心率平方
  eccentricitySquared: 6.69437999014e-3,
  
  // 第二离心率平方
  secondEccentricitySquared: 6.73949674228e-3
};

// 椭球体类
class Ellipsoid {
  readonly semiMajorAxis: number;
  readonly semiMinorAxis: number;
  readonly flattening: number;
  readonly eccentricitySquared: number;
  
  constructor(
    semiMajorAxis: number = WGS84.semiMajorAxis,
    semiMinorAxis: number = WGS84.semiMinorAxis
  ) {
    this.semiMajorAxis = semiMajorAxis;
    this.semiMinorAxis = semiMinorAxis;
    this.flattening = (semiMajorAxis - semiMinorAxis) / semiMajorAxis;
    this.eccentricitySquared = 2 * this.flattening - this.flattening * this.flattening;
  }
  
  // 计算给定纬度的曲率半径
  radiusOfCurvature(latitude: number): number {
    const sinLat = Math.sin(latitude);
    return this.semiMajorAxis / Math.sqrt(1 - this.eccentricitySquared * sinLat * sinLat);
  }
}
```

### 13.2 经纬度到 ECEF 转换

```typescript
// ECEF (Earth-Centered, Earth-Fixed) 坐标系
interface Cartesian3 {
  x: number;
  y: number;
  z: number;
}

// 经纬度坐标
interface Cartographic {
  longitude: number;  // 弧度
  latitude: number;   // 弧度
  height: number;     // 米
}

class CoordinateConverter {
  private ellipsoid: Ellipsoid;
  
  constructor(ellipsoid: Ellipsoid = new Ellipsoid()) {
    this.ellipsoid = ellipsoid;
  }
  
  // 经纬度转 ECEF
  cartographicToCartesian(cartographic: Cartographic): Cartesian3 {
    const { longitude, latitude, height } = cartographic;
    const { semiMajorAxis, eccentricitySquared } = this.ellipsoid;
    
    const sinLat = Math.sin(latitude);
    const cosLat = Math.cos(latitude);
    const sinLon = Math.sin(longitude);
    const cosLon = Math.cos(longitude);
    
    // 曲率半径
    const N = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
    
    // ECEF 坐标
    const x = (N + height) * cosLat * cosLon;
    const y = (N + height) * cosLat * sinLon;
    const z = (N * (1 - eccentricitySquared) + height) * sinLat;
    
    return { x, y, z };
  }
  
  // ECEF 转经纬度
  cartesianToCartesian(cartesian: Cartesian3): Cartographic {
    const { x, y, z } = cartesian;
    const { semiMajorAxis, semiMinorAxis, eccentricitySquared } = this.ellipsoid;
    
    const longitude = Math.atan2(y, x);
    
    // 迭代求解纬度
    const p = Math.sqrt(x * x + y * y);
    let latitude = Math.atan2(z, p * (1 - eccentricitySquared));
    
    // Newton-Raphson 迭代
    for (let i = 0; i < 10; i++) {
      const sinLat = Math.sin(latitude);
      const N = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
      const newLatitude = Math.atan2(z + eccentricitySquared * N * sinLat, p);
      
      if (Math.abs(newLatitude - latitude) < 1e-12) break;
      latitude = newLatitude;
    }
    
    // 计算高度
    const sinLat = Math.sin(latitude);
    const N = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
    const height = p / Math.cos(latitude) - N;
    
    return { longitude, latitude, height };
  }
  
  // 批量转换（性能优化）
  cartographicArrayToCartesianArray(
    cartographics: Cartographic[]
  ): Cartesian3[] {
    const results: Cartesian3[] = [];
    const { semiMajorAxis, eccentricitySquared } = this.ellipsoid;
    
    for (const { longitude, latitude, height } of cartographics) {
      const sinLat = Math.sin(latitude);
      const cosLat = Math.cos(latitude);
      const sinLon = Math.sin(longitude);
      const cosLon = Math.cos(longion);
      
      const N = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
      
      results.push({
        x: (N + height) * cosLat * cosLon,
        y: (N + height) * cosLat * sinLon,
        z: (N * (1 - eccentricitySquared) + height) * sinLat
      });
    }
    
    return results;
  }
}
```

### 13.3 ENU 局部坐标系

```typescript
// ENU (East-North-Up) 局部坐标系
class ENUSystem {
  private converter: CoordinateConverter;
  
  constructor(converter: CoordinateConverter) {
    this.converter = converter;
  }
  
  // 计算 ENU 到 ECEF 的旋转矩阵
  getRotationMatrix(origin: Cartographic): Matrix3 {
    const { longitude, latitude } = origin;
    
    const sinLon = Math.sin(longitude);
    const cosLon = Math.cos(longitude);
    const sinLat = Math.sin(latitude);
    const cosLat = Math.cos(latitude);
    
    // ENU 到 ECEF 的旋转矩阵
    return [
      [-sinLon, -sinLat * cosLon, cosLat * cosLon],
      [cosLon, -sinLat * sinLon, cosLat * sinLon],
      [0, cosLat, sinLat]
    ];
  }
  
  // ENU 转 ECEF
  enuToECEF(
    enu: Cartesian3,
    origin: Cartographic
  ): Cartesian3 {
    const matrix = this.getRotationMatrix(origin);
    const originECEF = this.converter.cartographicToCartesian(origin);
    
    return {
      x: originECEF.x + matrix[0][0] * enu.x + matrix[0][1] * enu.y + matrix[0][2] * enu.z,
      y: originECEF.y + matrix[1][0] * enu.x + matrix[1][1] * enu.y + matrix[1][2] * enu.z,
      z: originECEF.z + matrix[2][0] * enu.x + matrix[2][1] * enu.y + matrix[2][2] * enu.z
    };
  }
  
  // ECEF 转 ENU
  ecefToENU(
    ecef: Cartesian3,
    origin: Cartographic
  ): Cartesian3 {
    const matrix = this.getRotationMatrix(origin);
    const originECEF = this.converter.cartographicToCartesian(origin);
    
    const dx = ecef.x - originECEF.x;
    const dy = ecef.y - originECEF.y;
    const dz = ecef.z - originECEF.z;
    
    // 转置矩阵（逆旋转）
    return {
      x: matrix[0][0] * dx + matrix[1][0] * dy + matrix[2][0] * dz,
      y: matrix[0][1] * dx + matrix[1][1] * dy + matrix[2][1] * dz,
      z: matrix[0][2] * dx + matrix[1][2] * dy + matrix[2][2] * dz
    };
  }
}
```

### 13.4 RTE 精度优化

```typescript
// RTE (Relative To Eye) 双精度编码
interface EncodedCartesian3 {
  high: Cartesian3;  // 高位
  low: Cartesian3;   // 低位
}

class RTEncoder {
  // 将双精度拆分为两个浮点数
  encode(value: number): { high: number; low: number } {
    const high = Math.fround(value);
    const low = value - high;
    return { high, low };
  }
  
  // 编码 ECEF 坐标
  encodeCartesian3(cartesian: Cartesian3): EncodedCartesian3 {
    return {
      high: {
        x: Math.fround(cartesian.x),
        y: Math.fround(cartesian.y),
        z: Math.fround(cartesian.z)
      },
      low: {
        x: cartesian.x - Math.fround(cartesian.x),
        y: cartesian.y - Math.fround(cartesian.y),
        z: cartesian.z - Math.fround(cartesian.z)
      }
    };
  }
  
  // 相对编码（相对于视点）
  encodeRelativeToEye(
    cartesian: Cartesian3,
    eye: Cartesian3
  ): EncodedCartesian3 {
    const relative = {
      x: cartesian.x - eye.x,
      y: cartesian.y - eye.y,
      z: cartesian.z - eye.z
    };
    
    return this.encodeCartesian3(relative);
  }
}

// GLSL 中的 RTE 计算
const RTE_GLSL = `
// RTE 顶点着色器
attribute vec3 positionHigh;
attribute vec3 positionLow;

uniform vec3 eyeHigh;
uniform vec3 eyeLow;

void main() {
  // 高精度相对坐标计算
  vec3 t1 = positionLow - eyeLow;
  vec3 e = t1 - positionLow;
  vec3 t2 = ((-eyeLow - e) + (positionLow - (t1 - e))) + positionHigh - eyeHigh;
  vec3 highDifference = t1 + t2;
  vec3 lowDifference = t2 - (highDifference - t1);
  
  vec3 position = highDifference + lowDifference;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
```

### 13.5 大地测量计算

```typescript
class Geodesy {
  private ellipsoid: Ellipsoid;
  
  constructor(ellipsoid: Ellipsoid = new Ellipsoid()) {
    this.ellipsoid = ellipsoid;
  }
  
  // Vincenty 公式计算两点距离
  vincentyDistance(
    point1: Cartographic,
    point2: Cartographic
  ): number {
    const { semiMajorAxis, flattening } = this.ellipsoid;
    const semiMinorAxis = semiMajorAxis * (1 - flattening);
    
    const L = point2.longitude - point1.longitude;
    const U1 = Math.atan((1 - flattening) * Math.tan(point1.latitude));
    const U2 = Math.atan((1 - flattening) * Math.tan(point2.latitude));
    
    const sinU1 = Math.sin(U1);
    const cosU1 = Math.cos(U1);
    const sinU2 = Math.sin(U2);
    const cosU2 = Math.cos(U2);
    
    let lambda = L;
    let lambdaPrev = 0;
    let iterLimit = 100;
    let cosSqAlpha: number;
    let sinSigma: number;
    let cosSigma: number;
    let cos2SigmaM: number;
    let sigma: number;
    
    do {
      const sinLambda = Math.sin(lambda);
      const cosLambda = Math.cos(lambda);
      
      sinSigma = Math.sqrt(
        (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
      );
      
      if (sinSigma === 0) return 0;
      
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
      sigma = Math.atan2(sinSigma, cosSigma);
      
      const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
      cosSqAlpha = 1 - sinAlpha ** 2;
      
      cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
      
      const C = flattening / 16 * cosSqAlpha * (4 + flattening * (4 - 3 * cosSqAlpha));
      
      lambdaPrev = lambda;
      lambda = L + (1 - C) * flattening * sinAlpha * (
        sigma + C * sinSigma * (
          cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)
        )
      );
    } while (Math.abs(lambda - lambdaPrev) > 1e-12 && --iterLimit > 0);
    
    if (iterLimit === 0) return NaN;
    
    const uSq = cosSqAlpha * (semiMajorAxis ** 2 - semiMinorAxis ** 2) / semiMinorAxis ** 2;
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    
    const deltaSigma = B * sinSigma * (
      cos2SigmaM + B / 4 * (
        cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
        B / 6 * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
      )
    );
    
    return semiMinorAxis * A * (sigma - deltaSigma);
  }
  
  // Haversine 公式（球面近似，快速）
  haversineDistance(
    point1: Cartographic,
    point2: Cartographic
  ): number {
    const R = this.ellipsoid.semiMajorAxis;
    
    const dLat = point2.latitude - point1.latitude;
    const dLon = point2.longitude - point1.longitude;
    
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(point1.latitude) * Math.cos(point2.latitude) *
              Math.sin(dLon / 2) ** 2;
    
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  // 计算方位角
  bearing(
    point1: Cartographic,
    point2: Cartographic
  ): number {
    const dLon = point2.longitude - point1.longitude;
    
    const y = Math.sin(dLon) * Math.cos(point2.latitude);
    const x = Math.cos(point1.latitude) * Math.sin(point2.latitude) -
              Math.sin(point1.latitude) * Math.cos(point2.latitude) * Math.cos(dLon);
    
    return Math.atan2(y, x);
  }
  
  // 根据起点、距离和方位角计算终点
  destination(
    start: Cartographic,
    distance: number,
    bearing: number
  ): Cartographic {
    const R = this.ellipsoid.semiMajorAxis;
    
    const lat1 = start.latitude;
    const lon1 = start.longitude;
    
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance / R) +
      Math.cos(lat1) * Math.sin(distance / R) * Math.cos(bearing)
    );
    
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(distance / R) * Math.cos(lat1),
      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
    );
    
    return { longitude: lon2, latitude: lat2, height: start.height };
  }
}
```

### 13.6 投影系统

```typescript
// 投影接口
interface Projection {
  project(cartographic: Cartographic): { x: number; y: number };
  unproject(point: { x: number; y: number }): Cartographic;
}

// Web Mercator 投影
class WebMercatorProjection implements Projection {
  private semiMajorAxis: number = WGS84.semiMajorAxis;
  
  project(cartographic: Cartographic): { x: number; y: number } {
    const { longitude, latitude } = cartographic;
    
    const x = this.semiMajorAxis * longitude;
    const y = this.semiMajorAxis * Math.log(
      Math.tan(Math.PI / 4 + latitude / 2)
    );
    
    return { x, y };
  }
  
  unproject(point: { x: number; y: number }): Cartographic {
    const longitude = point.x / this.semiMajorAxis;
    const latitude = 2 * Math.atan(Math.exp(point.y / this.semiMajorAxis)) - Math.PI / 2;
    
    return { longitude, latitude, height: 0 };
  }
}

// Equirectangular 投影
class EquirectangularProjection implements Projection {
  private semiMajorAxis: number = WGS84.semiMajorAxis;
  
  project(cartographic: Cartographic): { x: number; y: number } {
    return {
      x: this.semiMajorAxis * cartographic.longitude,
      y: this.semiMajorAxis * cartographic.latitude
    };
  }
  
  unproject(point: { x: number; y: number }): Cartographic {
    return {
      longitude: point.x / this.semiMajorAxis,
      latitude: point.y / this.semiMajorAxis,
      height: 0
    };
  }
}
```
