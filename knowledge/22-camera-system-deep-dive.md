# 22 Camera System Deep Dive

## 1. 目标与边界

本章解决相机系统的深入实现问题：

1. 如何实现椭球体相机
2. 如何实现地形跟随
3. 如何实现相机碰撞检测

本章聚焦相机系统，不讨论渲染相关问题。

---

## 2. 椭球体相机

### 2.1 相机状态

```typescript
interface CameraState {
  // 地理位置
  longitude: number;  // 弧度
  latitude: number;   // 弧度
  height: number;     // 米
  
  // 视角参数
  heading: number;    // 弧度，正北为0，顺时针增加
  pitch: number;      // 弧度，水平为0，向下为正
  roll: number;       // 弧度
  
  // 视锥参数
  fov: number;        // 弧度
  aspect: number;
  near: number;       // 米
  far: number;        // 米
}
```

### 2.2 椭球体相机类

```typescript
class EllipsoidCamera {
  private ellipsoid: Ellipsoid;
  private state: CameraState;
  
  constructor(ellipsoid: Ellipsoid) {
    this.ellipsoid = ellipsoid;
    this.state = {
      longitude: 0,
      latitude: 0,
      height: 10000,
      heading: 0,
      pitch: -Math.PI / 4,  // 45度俯视
      roll: 0,
      fov: Math.PI / 3,     // 60度视场角
      aspect: 16 / 9,
      near: 1,
      far: 100000000
    };
  }
  
  // 设置相机位置
  setPosition(longitude: number, latitude: number, height: number): void {
    this.state.longitude = longitude;
    this.state.latitude = latitude;
    this.state.height = height;
    this.updateMatrices();
  }
  
  // 设置相机姿态
  setOrientation(heading: number, pitch: number, roll: number): void {
    this.state.heading = heading;
    this.state.pitch = pitch;
    this.state.roll = roll;
    this.updateMatrices();
  }
  
  // 计算视图矩阵
  private calculateViewMatrix(): Matrix4 {
    // 计算相机 ECEF 坐标
    const cartographic = {
      longitude: this.state.longitude,
      latitude: this.state.latitude,
      height: this.state.height
    };
    const position = cartographicToCartesian(this.ellipsoid, cartographic);
    
    // 计算相机朝向
    const direction = this.calculateDirection();
    const up = this.calculateUp();
    
    // 构建视图矩阵
    return this.lookAt(position, position.clone().add(direction), up);
  }
  
  // 计算相机方向
  private calculateDirection(): Vector3 {
    const { heading, pitch } = this.state;
    
    // 局部坐标系下的方向
    const x = Math.sin(heading) * Math.cos(pitch);
    const y = Math.cos(heading) * Math.cos(pitch);
    const z = Math.sin(pitch);
    
    // 转换到 ECEF
    return this.localToECEF(new Vector3(x, y, z));
  }
  
  // 计算相机上方向
  private calculateUp(): Vector3 {
    const { heading, pitch, roll } = this.state;
    
    // 局部坐标系下的上方向
    const up = new Vector3(0, 0, 1);
    
    // 应用 roll
    const rotated = this.rotateAroundAxis(up, new Vector3(0, 1, 0), roll);
    
    // 转换到 ECEF
    return this.localToECEF(rotated);
  }
  
  // 局部坐标到 ECEF
  private localToECEF(local: Vector3): Vector3 {
    const { longitude, latitude } = this.state;
    
    const sinLon = Math.sin(longitude);
    const cosLon = Math.cos(longitude);
    const sinLat = Math.sin(latitude);
    const cosLat = Math.cos(latitude);
    
    // ENU 到 ECEF 旋转矩阵
    return new Vector3(
      -sinLon * local.x - sinLat * cosLon * local.y + cosLat * cosLon * local.z,
      cosLon * local.x - sinLat * sinLon * local.y + cosLat * sinLon * local.z,
      cosLat * local.y + sinLat * local.z
    );
  }
}
```

---

## 3. 相机控制

### 3.1 轨道相机

```typescript
class OrbitCameraController {
  private camera: EllipsoidCamera;
  private target: Cartographic;
  private distance: number;
  
  constructor(camera: EllipsoidCamera) {
    this.camera = camera;
    this.target = { longitude: 0, latitude: 0, height: 0 };
    this.distance = 10000000;
  }
  
  // 设置目标点
  setTarget(target: Cartographic): void {
    this.target = target;
    this.updateCamera();
  }
  
  // 设置距离
  setDistance(distance: number): void {
    this.distance = Math.max(100, Math.min(distance, 100000000));
    this.updateCamera();
  }
  
  // 旋转
  rotate(deltaHeading: number, deltaPitch: number): void {
    const heading = this.camera.state.heading + deltaHeading;
    const pitch = Math.max(-Math.PI / 2, Math.min(
      this.camera.state.pitch + deltaPitch,
      Math.PI / 2
    ));
    
    this.camera.setOrientation(heading, pitch, this.camera.state.roll);
    this.updateCamera();
  }
  
  // 更新相机位置
  private updateCamera(): void {
    // 计算相机位置
    const heading = this.camera.state.heading;
    const pitch = this.camera.state.pitch;
    
    const x = this.distance * Math.sin(heading) * Math.cos(pitch);
    const y = this.distance * Math.cos(heading) * Math.cos(pitch);
    const z = this.distance * Math.sin(pitch);
    
    // 转换到地理坐标
    const enu = { east: x, north: y, up: z };
    const position = this.enuToCartographic(enu);
    
    this.camera.setPosition(position.longitude, position.latitude, position.height);
  }
  
  private enuToCartographic(enu: { east: number; north: number; up: number }): Cartographic {
    // ENU 到 Cartographic 转换
    const { east, north, up } = enu;
    const { longitude, latitude, height } = this.target;
    
    // 简化计算（假设小范围）
    const earthRadius = 6371000;
    const dLat = north / earthRadius;
    const dLon = east / (earthRadius * Math.cos(latitude));
    
    return {
      longitude: longitude + dLon,
      latitude: latitude + dLat,
      height: height + up
    };
  }
}
```

### 3.2 第一人称相机

```typescript
class FirstPersonCameraController {
  private camera: EllipsoidCamera;
  private moveSpeed: number = 100;  // 米/秒
  private rotateSpeed: number = 0.002;  // 弧度/像素
  
  constructor(camera: EllipsoidCamera) {
    this.camera = camera;
  }
  
  // 前进
  moveForward(deltaTime: number): void {
    const distance = this.moveSpeed * deltaTime;
    const direction = this.camera.calculateDirection();
    
    const position = this.getPosition();
    position.x += direction.x * distance;
    position.y += direction.y * distance;
    position.z += direction.z * distance;
    
    this.setPosition(position);
  }
  
  // 向右移动
  moveRight(deltaTime: number): void {
    const distance = this.moveSpeed * deltaTime;
    const direction = this.camera.calculateDirection();
    const up = this.camera.calculateUp();
    const right = direction.clone().cross(up).normalize();
    
    const position = this.getPosition();
    position.x += right.x * distance;
    position.y += right.y * distance;
    position.z += right.z * distance;
    
    this.setPosition(position);
  }
  
  // 鼠标旋转
  rotate(deltaX: number, deltaY: number): void {
    const heading = this.camera.state.heading - deltaX * this.rotateSpeed;
    const pitch = Math.max(-Math.PI / 2, Math.min(
      this.camera.state.pitch - deltaY * this.rotateSpeed,
      Math.PI / 2
    ));
    
    this.camera.setOrientation(heading, pitch, this.camera.state.roll);
  }
}
```

---

## 4. 地形跟随

### 4.1 地形高度查询

```typescript
class TerrainFollowing {
  private terrainProvider: TerrainProvider;
  private camera: EllipsoidCamera;
  private heightAboveTerrain: number = 100;  // 米
  
  constructor(camera: EllipsoidCamera, terrainProvider: TerrainProvider) {
    this.camera = camera;
    this.terrainProvider = terrainProvider;
  }
  
  // 更新相机高度
  async updateHeight(): Promise<void> {
    const { longitude, latitude } = this.camera.state;
    
    // 查询地形高度
    const terrainHeight = await this.terrainProvider.getHeight(longitude, latitude);
    
    // 设置相机高度
    const newHeight = terrainHeight + this.heightAboveTerrain;
    this.camera.setPosition(longitude, latitude, newHeight);
  }
  
  // 设置地形跟随高度
  setHeightAboveTerrain(height: number): void {
    this.heightAboveTerrain = Math.max(10, height);
  }
}
```

### 4.2 地形碰撞检测

```typescript
class TerrainCollision {
  private terrainProvider: TerrainProvider;
  private ellipsoid: Ellipsoid;
  private minClearance: number = 50;  // 米
  
  constructor(terrainProvider: TerrainProvider, ellipsoid: Ellipsoid) {
    this.terrainProvider = terrainProvider;
    this.ellipsoid = ellipsoid;
  }
  
  // 检查碰撞
  async checkCollision(position: Cartographic): Promise<boolean> {
    const terrainHeight = await this.terrainProvider.getHeight(
      position.longitude,
      position.latitude
    );
    
    return position.height < terrainHeight + this.minClearance;
  }
  
  // 解决碰撞
  async resolveCollision(position: Cartographic): Promise<Cartographic> {
    const terrainHeight = await this.terrainProvider.getHeight(
      position.longitude,
      position.latitude
    );
    
    const minHeight = terrainHeight + this.minClearance;
    
    if (position.height < minHeight) {
      return {
        longitude: position.longitude,
        latitude: position.latitude,
        height: minHeight
      };
    }
    
    return position;
  }
  
  // 射线碰撞检测
  async raycast(
    origin: Cartographic,
    direction: Vector3,
    maxDistance: number
  ): Promise<Cartographic | null> {
    const steps = 100;
    const stepSize = maxDistance / steps;
    
    for (let i = 0; i < steps; i++) {
      const distance = i * stepSize;
      
      // 计算射线上的点
      const point = this.pointAlongRay(origin, direction, distance);
      
      // 查询地形高度
      const terrainHeight = await this.terrainProvider.getHeight(
        point.longitude,
        point.latitude
      );
      
      // 检查碰撞
      if (point.height < terrainHeight) {
        return {
          longitude: point.longitude,
          latitude: point.latitude,
          height: terrainHeight
        };
      }
    }
    
    return null;
  }
  
  private pointAlongRay(
    origin: Cartographic,
    direction: Vector3,
    distance: number
  ): Cartographic {
    // 简化计算
    const earthRadius = this.ellipsoid.semiMajorAxis;
    const dLat = (direction.y * distance) / earthRadius;
    const dLon = (direction.x * distance) / (earthRadius * Math.cos(origin.latitude));
    const dHeight = direction.z * distance;
    
    return {
      longitude: origin.longitude + dLon,
      latitude: origin.latitude + dLat,
      height: origin.height + dHeight
    };
  }
}
```

---

## 5. 相机动画

### 5.1 飞行动画

```typescript
class FlyToAnimation {
  private camera: EllipsoidCamera;
  private startState: CameraState;
  private endState: CameraState;
  private duration: number;
  private elapsed: number = 0;
  private easing: EasingFunction;
  
  constructor(
    camera: EllipsoidCamera,
    target: CameraState,
    duration: number = 3000,
    easing: EasingFunction = easeInOutCubic
  ) {
    this.camera = camera;
    this.startState = { ...camera.state };
    this.endState = target;
    this.duration = duration;
    this.easing = easing;
  }
  
  // 更新动画
  update(deltaTime: number): boolean {
    this.elapsed += deltaTime;
    
    const t = Math.min(this.elapsed / this.duration, 1);
    const easedT = this.easing(t);
    
    // 插值相机状态
    const state = this.interpolate(this.startState, this.endState, easedT);
    
    this.camera.setPosition(state.longitude, state.latitude, state.height);
    this.camera.setOrientation(state.heading, state.pitch, state.roll);
    
    return t >= 1;
  }
  
  private interpolate(
    start: CameraState,
    end: CameraState,
    t: number
  ): CameraState {
    return {
      longitude: this.lerpAngle(start.longitude, end.longitude, t),
      latitude: this.lerp(start.latitude, end.latitude, t),
      height: this.lerp(start.height, end.height, t),
      heading: this.lerpAngle(start.heading, end.heading, t),
      pitch: this.lerp(start.pitch, end.pitch, t),
      roll: this.lerpAngle(start.roll, end.roll, t),
      fov: start.fov,
      aspect: start.aspect,
      near: start.near,
      far: start.far
    };
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  private lerpAngle(a: number, b: number, t: number): number {
    // 处理角度环绕
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
  }
}

// 缓动函数
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

---

## 6. 相机防钻地系统详解

### 6.1 问题描述

**现象**：
- 缩放时相机穿过地形，看到地底
- 平移时相机突然沉入地面
- 飞行动画结束时相机在地下

**原因**：
- 没有实时碰撞检测
- 碰撞检测延迟（异步查询地形高度）
- 碰撞响应过于突兀

### 6.2 完整碰撞系统

```typescript
class CameraCollisionSystem {
  private terrainProvider: TerrainProvider;
  private ellipsoid: Ellipsoid;
  
  // 碰撞参数
  private config: CollisionConfig = {
    minClearance: 50,        // 最小离地高度（米）
    maxSlopeAngle: 60,       // 最大坡度（度）
    predictiveDistance: 100, // 预测距离（米）
    smoothingFactor: 0.3,    // 平滑因子
    enablePrediction: true   // 启用预测
  };
  
  // 地形高度缓存
  private heightCache: Map<string, HeightCacheEntry> = new Map();
  private cacheSize = 1000;
  
  constructor(terrainProvider: TerrainProvider, ellipsoid: Ellipsoid) {
    this.terrainProvider = terrainProvider;
    this.ellipsoid = ellipsoid;
  }
  
  // 每帧更新
  async update(cameraState: CameraState): Promise<CameraState> {
    // 1. 获取当前位置的地形高度
    const currentHeight = await this.getTerrainHeight(
      cameraState.longitude,
      cameraState.latitude
    );
    
    // 2. 检查是否需要碰撞响应
    const minHeight = currentHeight + this.config.minClearance;
    
    if (cameraState.height < minHeight) {
      // 3. 计算碰撞响应
      return this.resolveCollision(cameraState, minHeight);
    }
    
    // 4. 预测性检测（检查移动方向）
    if (this.config.enablePrediction) {
      const predictedState = this.predictCollision(cameraState);
      if (predictedState) {
        return predictedState;
      }
    }
    
    return cameraState;
  }
  
  // 获取地形高度（带缓存）
  private async getTerrainHeight(lng: number, lat: number): Promise<number> {
    const key = this.getCacheKey(lng, lat);
    
    // 检查缓存
    const cached = this.heightCache.get(key);
    if (cached && Date.now() - cached.timestamp < 1000) {
      return cached.height;
    }
    
    // 查询地形
    const height = await this.terrainProvider.getHeight(lng, lat);
    
    // 更新缓存
    this.updateCache(key, height);
    
    return height;
  }
  
  private getCacheKey(lng: number, lat: number): string {
    // 量化到网格（约10米精度）
    const quantizedLng = Math.round(lng * 10000) / 10000;
    const quantizedLat = Math.round(lat * 10000) / 10000;
    return `${quantizedLng},${quantizedLat}`;
  }
  
  private updateCache(key: string, height: number): void {
    // LRU 淘汰
    if (this.heightCache.size >= this.cacheSize) {
      const oldestKey = this.heightCache.keys().next().value;
      this.heightCache.delete(oldestKey);
    }
    
    this.heightCache.set(key, {
      height,
      timestamp: Date.now()
    });
  }
  
  // 碰撞响应（平滑提升）
  private resolveCollision(
    state: CameraState,
    minHeight: number
  ): CameraState {
    // 平滑提升（避免突兀）
    const targetHeight = minHeight;
    const smoothHeight = state.height + 
      (targetHeight - state.height) * this.config.smoothingFactor;
    
    return {
      ...state,
      height: Math.max(smoothHeight, minHeight)
    };
  }
  
  // 预测性碰撞检测
  private predictCollision(state: CameraState): CameraState | null {
    // 计算移动方向
    const direction = this.computeMovementDirection(state);
    if (!direction) return null;
    
    // 预测未来位置
    const predictedLng = state.longitude + direction.lng * 0.1; // 0.1度
    const predictedLat = state.latitude + direction.lat * 0.1;
    
    // 检查预测位置的地形高度
    const predictedHeight = this.getTerrainHeightSync(predictedLng, predictedLat);
    const predictedMinHeight = predictedHeight + this.config.minClearance;
    
    if (state.height < predictedMinHeight) {
      // 提前调整
      return {
        ...state,
        height: Math.max(state.height, predictedMinHeight)
      };
    }
    
    return null;
  }
  
  // 同步获取缓存的地形高度
  private getTerrainHeightSync(lng: number, lat: number): number {
    const key = this.getCacheKey(lng, lat);
    const cached = this.heightCache.get(key);
    return cached ? cached.height : 0;
  }
}
```

### 6.3 缩放时的防钻地

```typescript
class ZoomCollisionHandler {
  private collisionSystem: CameraCollisionSystem;
  private camera: EllipsoidCamera;
  
  // 缩放限制
  private limits = {
    minHeight: 10,      // 最小高度（米）
    maxHeight: 100000000, // 最大高度（米）
    zoomSpeedFactor: 0.1  // 缩放速度因子
  };
  
  async handleZoom(delta: number, cameraState: CameraState): Promise<CameraState> {
    // 计算新高度（对数缩放）
    const zoomFactor = 1 + delta * this.limits.zoomSpeedFactor;
    let newHeight = cameraState.height * zoomFactor;
    
    // 限制高度范围
    newHeight = Math.max(this.limits.minHeight, 
                 Math.min(newHeight, this.limits.maxHeight));
    
    // 应用碰撞检测
    const newState = { ...cameraState, height: newHeight };
    return this.collisionSystem.update(newState);
  }
}
```

### 6.4 平移时的防钻地

```typescript
class PanCollisionHandler {
  private collisionSystem: CameraCollisionSystem;
  private camera: EllipsoidCamera;
  
  async handlePan(
    deltaLng: number,
    deltaLat: number,
    cameraState: CameraState
  ): Promise<CameraState> {
    // 计算新位置
    let newLng = cameraState.longitude + deltaLng;
    let newLat = cameraState.latitude + deltaLat;
    
    // 纬度限制
    newLat = Math.max(-Math.PI / 2 + 0.001, 
             Math.min(newLat, Math.PI / 2 - 0.001));
    
    // 经度环绕
    if (newLng > Math.PI) newLng -= 2 * Math.PI;
    if (newLng < -Math.PI) newLng += 2 * Math.PI;
    
    // 应用碰撞检测
    const newState = {
      ...cameraState,
      longitude: newLng,
      latitude: newLat
    };
    
    return this.collisionSystem.update(newState);
  }
}
```

### 6.5 相机碰撞的完整流程

```typescript
class GlobeCameraController {
  private collisionSystem: CameraCollisionSystem;
  private zoomHandler: ZoomCollisionHandler;
  private panHandler: PanCollisionHandler;
  private flyToAnimation: FlyToAnimation | null = null;
  
  // 每帧更新
  async update(deltaTime: number): Promise<void> {
    let state = this.camera.state;
    
    // 1. 处理飞行动画
    if (this.flyToAnimation) {
      const done = this.flyToAnimation.update(deltaTime);
      if (done) {
        this.flyToAnimation = null;
      }
      state = this.camera.state;
    }
    
    // 2. 应用碰撞检测
    state = await this.collisionSystem.update(state);
    
    // 3. 更新相机状态
    this.camera.setState(state);
  }
  
  // 处理缩放
  async onZoom(delta: number): Promise<void> {
    const newState = await this.zoomHandler.handleZoom(delta, this.camera.state);
    this.camera.setState(newState);
  }
  
  // 处理平移
  async onPan(deltaLng: number, deltaLat: number): Promise<void> {
    const newState = await this.panHandler.handlePan(deltaLng, deltaLat, this.camera.state);
    this.camera.setState(newState);
  }
  
  // 飞行到目标
  flyTo(target: Cartographic, duration: number = 3000): void {
    // 先进行碰撞检测
    const targetState = this.collisionSystem.resolveCollision({
      ...this.camera.state,
      longitude: target.longitude,
      latitude: target.latitude,
      height: target.height
    });
    
    this.flyToAnimation = new FlyToAnimation(
      this.camera,
      targetState,
      duration
    );
  }
}
```

### 6.6 碰撞检测的性能优化

```typescript
class OptimizedCollisionSystem {
  // 1. 使用空间索引加速查询
  private spatialIndex: RTree;
  
  // 2. 预加载可见区域的地形高度
  private preloadVisibleArea(camera: Camera): void {
    const visibleBounds = this.computeVisibleBounds(camera);
    this.terrainProvider.preload(visibleBounds);
  }
  
  // 3. 使用 LOD 降低远处精度
  private getTerrainHeightLOD(lng: number, lat: number, distance: number): number {
    if (distance > 100000) {
      // 远处使用低精度
      return this.terrainProvider.getHeightLowRes(lng, lat);
    }
    return this.terrainProvider.getHeight(lng, lat);
  }
  
  // 4. 异步预计算
  async prefetchPath(from: Cartographic, to: Cartographic): Promise<void> {
    const points = this.interpolatePath(from, to, 10);
    
    // 并行预取
    await Promise.all(
      points.map(p => this.terrainProvider.getHeight(p.longitude, p.latitude))
    );
  }
}
```

### 6.7 验收标准

满足以下项可认为相机防钻地系统达标：

1. [ ] 缩放到最小时，相机不会穿过地形
2. [ ] 平移时相机不会突然沉入地面
3. [ ] 飞行动画结束时相机在地面之上
4. [ ] 碰撞响应平滑，无突兀跳变
5. [ ] 性能影响可接受（< 2ms/帧）

---

## 6. 验收清单

满足以下项可认为相机系统达标：

1. [ ] 椭球体相机定位准确
2. [ ] 相机控制响应流畅
3. [ ] 地形跟随稳定
4. [ ] 碰撞检测有效
5. [ ] 飞行动画平滑

---

## 7. 参考源码

- `src/core/CameraController.ts` - 相机控制器
- `src/core/EllipsoidCamera.ts` - 椭球体相机
- `src/core/TerrainFollowing.ts` - 地形跟随
- `src/core/FlyToAnimation.ts` - 飞行动画

---

## 8. 下一步行动

1. 优化相机控制性能
2. 添加更多相机模式
3. 完善碰撞检测
4. 添加相机路径动画