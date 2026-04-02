# 19 Ellipsoid and Geodesy

## 1. 目标与边界

本章解决椭球体和大地测量的实现问题：

1. 如何建模地球椭球体
2. 如何进行大地测量计算
3. 如何处理坐标系转换

本章聚焦椭球体和大地测量，不讨论渲染相关问题。

---

## 2. 椭球体建模

### 2.1 WGS84 参数

```typescript
const WGS84 = {
  // 长半轴（赤道半径）
  semiMajorAxis: 6378137.0,  // 米
  
  // 短半轴（极半径）
  semiMinorAxis: 6356752.314245,  // 米
  
  // 扁率
  flattening: 1 / 298.257223563,
  
  // 第一离心率平方
  eccentricitySquared: 6.69437999014e-3,
  
  // 第二离心率平方
  secondEccentricitySquared: 6.73949674228e-3
};
```

### 2.2 椭球体类

```typescript
class Ellipsoid {
  readonly semiMajorAxis: number;  // 长半轴 a
  readonly semiMinorAxis: number;  // 短半轴 b
  readonly flattening: number;     // 扁率 f = (a-b)/a
  readonly eccentricitySquared: number;  // 第一离心率平方 e²
  
  constructor(a: number, b: number) {
    this.semiMajorAxis = a;
    this.semiMinorAxis = b;
    this.flattening = (a - b) / a;
    this.eccentricitySquared = 1 - (b * b) / (a * a);
  }
  
  // 计算给定纬度的卯酉圈曲率半径 N
  radiusOfCurvature(latitude: number): number {
    const sinLat = Math.sin(latitude);
    return this.semiMajorAxis / Math.sqrt(
      1 - this.eccentricitySquared * sinLat * sinLat
    );
  }
  
  // 计算子午圈曲率半径 M
  meridianRadius(latitude: number): number {
    const sinLat = Math.sin(latitude);
    const e2 = this.eccentricitySquared;
    return this.semiMajorAxis * (1 - e2) / Math.pow(
      1 - e2 * sinLat * sinLat,
      1.5
    );
  }
  
  // 计算平均曲率半径
  meanRadius(latitude: number): number {
    return Math.sqrt(
      this.radiusOfCurvature(latitude) * this.meridianRadius(latitude)
    );
  }
}
```

### 2.3 地球椭球体单例

```typescript
// 全局椭球体实例
export const EarthEllipsoid = new Ellipsoid(
  WGS84.semiMajorAxis,
  WGS84.semiMinorAxis
);
```

---

## 3. 坐标系定义

### 3.1 地理坐标系 (Cartographic)

```typescript
// 经纬度高度坐标
interface Cartographic {
  longitude: number;  // 经度（弧度）
  latitude: number;   // 纬度（弧度）
  height: number;     // 椭球面高度（米）
}

// 工具函数
function cartographic(longitude: number, latitude: number, height: number = 0): Cartographic {
  return { longitude, latitude, height };
}

// 角度转弧度
function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

// 弧度转角度
function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}
```

### 3.2 地心地固坐标系 (ECEF)

```typescript
// ECEF 坐标（地心为原点）
interface Cartesian3 {
  x: number;  // 米
  y: number;  // 米
  z: number;  // 米
}

// 工具函数
function cartesian3(x: number, y: number, z: number): Cartesian3 {
  return { x, y, z };
}
```

### 3.3 局部坐标系 (ENU)

```typescript
// East-North-Up 局部坐标系
interface ENU {
  east: number;   // 米
  north: number;  // 米
  up: number;     // 米
}
```

---

## 4. 坐标转换

### 4.1 Cartographic 到 ECEF

```typescript
function cartographicToCartesian(
  ellipsoid: Ellipsoid,
  cartographic: Cartographic
): Cartesian3 {
  const { longitude, latitude, height } = cartographic;
  const { semiMajorAxis, eccentricitySquared } = ellipsoid;
  
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  
  // 卯酉圈曲率半径
  const N = semiMajorAxis / Math.sqrt(
    1 - eccentricitySquared * sinLat * sinLat
  );
  
  // ECEF 坐标
  const x = (N + height) * cosLat * cosLon;
  const y = (N + height) * cosLat * sinLon;
  const z = (N * (1 - eccentricitySquared) + height) * sinLat;
  
  return cartesian3(x, y, z);
}
```

### 4.2 ECEF 到 Cartographic

```typescript
function cartesianToCartographic(
  ellipsoid: Ellipsoid,
  cartesian: Cartesian3
): Cartographic {
  const { x, y, z } = cartesian;
  const { semiMajorAxis, semiMinorAxis, eccentricitySquared } = ellipsoid;
  
  // 经度
  const longitude = Math.atan2(y, x);
  
  // 辅助计算
  const p = Math.sqrt(x * x + y * y);
  const theta = Math.atan2(z * semiMajorAxis, p * semiMinorAxis);
  
  // 纬度（Bowring 公式）
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latitude = Math.atan2(
    z + ellipsoid.secondEccentricitySquared * semiMinorAxis * sinTheta * sinTheta * sinTheta,
    p - eccentricitySquared * semiMajorAxis * cosTheta * cosTheta * cosTheta
  );
  
  // 高度
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const N = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);
  const height = p / cosLat - N;
  
  return { longitude, latitude, height };
}
```

---

## 5. 大地测量计算

### 5.1 Vincenty 公式（精确距离）

```typescript
interface VincentyResult {
  distance: number;     // 米
  initialBearing: number;  // 弧度
  finalBearing: number;    // 弧度
}

function vincentyInverse(
  ellipsoid: Ellipsoid,
  point1: Cartographic,
  point2: Cartographic
): VincentyResult | null {
  const { semiMajorAxis: a, flattening: f } = ellipsoid;
  const b = a * (1 - f);
  
  const L = point2.longitude - point1.longitude;
  const U1 = Math.atan((1 - f) * Math.tan(point1.latitude));
  const U2 = Math.atan((1 - f) * Math.tan(point2.latitude));
  
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  
  let lambda = L;
  let lambdaPrev: number;
  let iterLimit = 100;
  
  let sinLambda: number, cosLambda: number;
  let sinSigma: number, cosSigma: number;
  let sigma: number, sinAlpha: number, cosSqAlpha: number;
  let cos2SigmaM: number;
  
  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    );
    
    if (sinSigma === 0) {
      return { distance: 0, initialBearing: 0, finalBearing: 0 };
    }
    
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    
    cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
    
    const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    
    lambdaPrev = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (
      sigma + C * sinSigma * (
        cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)
      )
    );
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && --iterLimit > 0);
  
  if (iterLimit === 0) {
    return null;  // 公式不收敛
  }
  
  // 计算距离
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  
  const deltaSigma = B * sinSigma * (
    cos2SigmaM + B / 4 * (
      cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
      B / 6 * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
    )
  );
  
  const distance = b * A * (sigma - deltaSigma);
  
  // 计算方位角
  const initialBearing = Math.atan2(
    cosU2 * sinLambda,
    cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
  );
  
  const finalBearing = Math.atan2(
    cosU1 * sinLambda,
    -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda
  );
  
  return { distance, initialBearing, finalBearing };
}
```

### 5.2 Haversine 公式（球面近似）

```typescript
function haversineDistance(
  radius: number,
  point1: Cartographic,
  point2: Cartographic
): number {
  const dLat = point2.latitude - point1.latitude;
  const dLon = point2.longitude - point1.longitude;
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(point1.latitude) * Math.cos(point2.latitude) *
            Math.sin(dLon / 2) ** 2;
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return radius * c;
}
```

### 5.3 正解问题（已知起点、距离、方位角，求终点）

```typescript
function vincentyDirect(
  ellipsoid: Ellipsoid,
  start: Cartographic,
  distance: number,
  bearing: number
): Cartographic | null {
  const { semiMajorAxis: a, flattening: f } = ellipsoid;
  const b = a * (1 - f);
  
  const sinAlpha1 = Math.sin(bearing);
  const cosAlpha1 = Math.cos(bearing);
  
  const tanU1 = (1 - f) * Math.tan(start.latitude);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  
  let sigma = distance / (b * A);
  let sigmaPrev: number;
  let iterLimit = 100;
  
  let cos2SigmaM: number;
  let sinSigma: number, cosSigma: number;
  
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    
    const deltaSigma = B * sinSigma * (
      cos2SigmaM + B / 4 * (
        cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
        B / 6 * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
      )
    );
    
    sigmaPrev = sigma;
    sigma = distance / (b * A) + deltaSigma;
  } while (Math.abs(sigma - sigmaPrev) > 1e-12 && --iterLimit > 0);
  
  if (iterLimit === 0) {
    return null;
  }
  
  // 计算终点坐标
  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
  );
  
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
  );
  
  const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * f * sinAlpha * (
    sigma + C * sinSigma * (
      cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)
    )
  );
  
  const lon2 = start.longitude + L;
  
  const alpha2 = Math.atan2(sinAlpha, -tmp);
  
  return {
    longitude: lon2,
    latitude: lat2,
    height: start.height
  };
}
```

---

## 6. 面积计算

### 6.1 球面多边形面积

```typescript
function sphericalPolygonArea(
  radius: number,
  coordinates: Cartographic[]
): number {
  if (coordinates.length < 3) return 0;
  
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    
    const lat1 = coordinates[i].latitude;
    const lat2 = coordinates[j].latitude;
    const lon1 = coordinates[i].longitude;
    const lon2 = coordinates[j].longitude;
    
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area) * radius * radius / 2;
  return area;
}
```

### 6.2 椭球面多边形面积（近似）

```typescript
function ellipsoidalPolygonArea(
  ellipsoid: Ellipsoid,
  coordinates: Cartographic[]
): number {
  // 使用球面近似，取平均半径
  const meanRadius = (ellipsoid.semiMajorAxis + ellipsoid.semiMinorAxis) / 2;
  return sphericalPolygonArea(meanRadius, coordinates);
}
```

---

## 7. 坐标系变换

### 7.1 ECEF 到 ENU 旋转矩阵

```typescript
function ecefToEnuRotation(
  referencePoint: Cartographic
): Matrix3 {
  const { longitude, latitude } = referencePoint;
  
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  
  // ENU 到 ECEF 的旋转矩阵的转置
  return [
    [-sinLon, cosLon, 0],
    [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    [cosLat * cosLon, cosLat * sinLon, sinLat]
  ];
}
```

### 7.2 ECEF 到 ENU 坐标转换

```typescript
function cartesianToENU(
  ellipsoid: Ellipsoid,
  cartesian: Cartesian3,
  referencePoint: Cartographic
): ENU {
  // 参考点 ECEF 坐标
  const refECEF = cartographicToCartesian(ellipsoid, referencePoint);
  
  // 差值
  const dx = cartesian.x - refECEF.x;
  const dy = cartesian.y - refECEF.y;
  const dz = cartesian.z - refECEF.z;
  
  // 旋转矩阵
  const R = ecefToEnuRotation(referencePoint);
  
  // ENU 坐标
  return {
    east: R[0][0] * dx + R[0][1] * dy + R[0][2] * dz,
    north: R[1][0] * dx + R[1][1] * dy + R[1][2] * dz,
    up: R[2][0] * dx + R[2][1] * dy + R[2][2] * dz
  };
}
```

### 7.3 ENU 到 ECEF 坐标转换

```typescript
function enuToCartesian(
  ellipsoid: Ellipsoid,
  enu: ENU,
  referencePoint: Cartographic
): Cartesian3 {
  // 参考点 ECEF 坐标
  const refECEF = cartographicToCartesian(ellipsoid, referencePoint);
  
  const { longitude, latitude } = referencePoint;
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  
  // ENU 到 ECEF
  const x = refECEF.x - sinLon * enu.east - sinLat * cosLon * enu.north + cosLat * cosLon * enu.up;
  const y = refECEF.y + cosLon * enu.east - sinLat * sinLon * enu.north + cosLat * sinLon * enu.up;
  const z = refECEF.z + cosLat * enu.north + sinLat * enu.up;
  
  return { x, y, z };
}
```

---

## 8. 验收清单

满足以下项可认为椭球体和大地测量实现达标：

1. [ ] WGS84 参数正确
2. [ ] 坐标转换精度满足需求（误差 < 1mm）
3. [ ] 大地测量计算正确
4. [ ] 面积计算准确
5. [ ] 坐标系变换正确

---

## 9. 参考源码

- `src/geo/Ellipsoid.ts` - 椭球体定义
- `src/geo/CoordinateConverter.ts` - 坐标转换
- `src/geo/Geodesy.ts` - 大地测量计算
- `src/geo/ENU.ts` - ENU 坐标系

---

## 10. 下一步行动

1. 优化 Vincenty 公式性能
2. 添加更多椭球体支持
3. 完善坐标系变换
4. 添加测试用例