# 08 Complete Engine Blueprint

## 1. 目标模块

按正规引擎思路，完整地球引擎最小模块如下：

1. `Engine Core`
2. `Scene/Frame Graph`
3. `Globe/Surface System`
4. `Quadtree LOD`
5. `Terrain Provider`
6. `Imagery Provider + Layer Stack`
7. `Request Scheduler`
8. `Tile Cache + Lifecycle`
9. `Terrain/Imagery Composition`
10. `Crack/Transition Stabilizer`
11. `Coordinate/Precision System`
12. `3D Tiles Runtime`
13. `Camera/Interaction`
14. `Diagnostics/Test Harness`

## 2. 推荐依赖方向（单向）

- Scene -> Surface -> Quadtree -> Provider
- Scene -> Overlay Layers
- Surface -> RequestScheduler / Cache
- Overlay 不允许反向依赖 Surface 内部网格实现

## 3. Host Tile 渲染策略（Cesium式）

- active host tile 内执行祖先影像链合成
- 地形子节点 ready 后原子替换
- 子未 ready 时父级保留
- 无地形数据时使用 ellipsoid host 承载影像

## 4. 实施阶段

- P0：稳定底座（SSE、队列、缓存、祖先回退）
- P1：质量与正确性（裂缝、极区、过渡、防闪烁）
- P2：扩展（3D Tiles 插件化、诊断与性能工具）

---

## 5. 详细模块蓝图（可执行架构文档）

### 5.1 Engine Core

**职责边界**：
- 负责：引擎生命周期管理、帧循环调度、模块编排、事件总线
- 不负责：具体渲染逻辑、数据加载、场景对象管理

**接口契约**：
```typescript
interface EngineCore {
  // 生命周期
  init(config: EngineConfig): void;
  start(): void;
  stop(): void;
  dispose(): void;
  
  // 帧循环
  requestRender(): void;
  setRenderMode(mode: 'continuous' | 'on-demand'): void;
  
  // 模块编排
  addModule(module: EngineModule): void;
  removeModule(moduleId: string): void;
  
  // 事件总线
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, payload?: any): void;
}
```

**落地映射**：
- 现有 `src/engine/GlobeEngine.ts` 是核心，需要重构为更清晰的模块编排
- 帧循环应独立为 `FrameLoop` 类，支持 `continuous` 和 `on-demand` 模式
- 事件系统应标准化为 `EventBus`，支持命名空间和优先级
- 删除旧的直接调用模式，改为模块注册制

**no-legacy 约束**：
- 移除所有直接方法调用，改为事件驱动
- 删除 `GlobeEngine` 中的遗留兼容方法

### 5.2 Scene/Frame Graph

**职责边界**：
- 负责：渲染图管理、渲染状态排序、draw call 优化
- 不负责：业务逻辑、数据加载

**接口契约**：
```typescript
interface FrameGraph {
  // 渲染节点管理
  addRenderNode(node: RenderNode): void;
  removeRenderNode(nodeId: string): void;
  
  // 渲染排序
  setSortStrategy(strategy: SortStrategy): void;
  
  // 渲染执行
  render(camera: Camera, renderer: WebGLRenderer): void;
}
```

**落地映射**：
- 当前渲染逻辑分散在各图层，需要集中到 `FrameGraph`
- 实现基于状态的渲染排序（材质、透明度、图层顺序）
- 支持批处理优化，减少 draw call

**no-legacy 约束**：
- 移除图层中的直接渲染调用，统一通过 FrameGraph
- 删除旧的渲染排序逻辑，使用统一的排序策略

### 5.3 Globe/Surface System

**职责边界**：
- 负责：地球表面瓦片管理、瓦片选择、可见性判断
- 不负责：具体地形生成、影像加载

**接口契约**：
```typescript
interface SurfaceSystem {
  // 瓦片管理
  update(camera: Camera): void;
  getVisibleTiles(): Tile[];
  
  // 瓦片选择
  selectTiles(camera: Camera): SelectionResult;
  
  // 生命周期
  disposeTile(tile: Tile): void;
}
```

**落地映射**：
- 现有 `src/tiles/SurfaceSystem.ts` 已基本实现，需要进一步解耦
- 瓦片选择逻辑应独立为 `QuadtreeLOD` 模块
- 删除旧的 `TerrainTileHost`、`Projection`、`FrustumCuller` 模块

**no-legacy 约束**：
- 删除所有旧的瓦片管理代码
- 移除直接依赖具体 provider 的代码

### 5.4 Quadtree LOD

**职责边界**：
- 负责：四叉树遍历、SSE 计算、瓦片细化决策
- 不负责：瓦片内容加载、渲染

**接口契约**：
```typescript
interface QuadtreeLOD {
  // 四叉树操作
  traverse(root: QuadtreeNode, visitor: Visitor): void;
  
  // SSE 计算
  calculateSSE(tile: Tile, camera: Camera): number;
  
  // 细化决策
  shouldRefine(tile: Tile, camera: Camera): boolean;
}
```

**落地映射**：
- 从 `SurfaceSystem` 中提取四叉树逻辑到独立模块
- 实现 Cesium 风格的 SSE 计算（考虑屏幕误差、距离、分辨率）
- 支持动态调整 SSE 阈值

**no-legacy 约束**：
- 删除旧的简化 SSE 计算
- 移除硬编码的细化阈值

### 5.5 Terrain Provider

**职责边界**：
- 负责：地形数据获取、解析、高程解码
- 不负责：地形网格生成、影像处理

**接口契约**：
```typescript
interface TerrainProvider {
  // 数据获取
  requestTile(tileKey: string, signal?: AbortSignal): Promise<TerrainData>;
  
  // 数据解析
  decode(data: ArrayBuffer, encoding: ElevationEncoding): Float32Array;
  
  // 元数据
  getTileAvailability(tileKey: string): TileAvailability;
}
```

**落地映射**：
- 现有 `src/tiles/TerrainTileLayer.ts` 中的数据获取逻辑应提取到 `TerrainProvider`
- 支持多种编码格式（Terrarium、Mapbox、QuantizedMesh）
- 实现缓存和重试策略

**no-legacy 约束**：
- 删除旧的直接 fetch 调用，使用统一的请求调度器
- 移除硬编码的数据源 URL

### 5.6 Imagery Provider + Layer Stack

**职责边界**：
- 负责：影像数据获取、解析、图层混合
- 不负责：地形处理、瓦片选择

**接口契约**：
```typescript
interface ImageryProvider {
  // 数据获取
  requestTile(tileKey: string, signal?: AbortSignal): Promise<ImageData>;
  
  // 图层混合
  blendLayers(layers: ImageryLayer[]): BlendedResult;
}

interface ImageryLayer {
  id: string;
  source: ImageryProvider;
  opacity: number;
  zIndex: number;
  blendMode: BlendMode;
}
```

**落地映射**：
- 现有 `RasterTileSource` 和 `RasterLayer` 已基本实现，需要进一步优化
- 实现图层混合栈，支持多种混合模式
- 支持动态图层顺序调整

**no-legacy 约束**：
- 删除旧的简单叠加逻辑，使用标准的图层混合
- 移除硬编码的图层顺序

### 5.7 Request Scheduler

**职责边界**：
- 负责：请求队列管理、并发控制、优先级排序
- 不负责：具体请求执行、数据解析

**接口契约**：
```typescript
interface RequestScheduler {
  // 请求调度
  schedule(request: TileRequest): Promise<Response>;
  
  // 优先级管理
  setPriority(requestId: string, priority: number): void;
  
  // 并发控制
  setConcurrencyLimit(limit: number): void;
  
  // 取消请求
  cancel(requestId: string): void;
}
```

**落地映射**：
- 现有 `src/tiles/RasterTileSource.ts` 中的请求逻辑应提取到 `RequestScheduler`
- 实现三队列模型（下载、解析、处理），参考第7章
- 支持动态并发限制和优先级调整

**no-legacy 约束**：
- 删除旧的简单队列，使用标准的三队列模型
- 移除硬编码的并发限制

### 5.8 Tile Cache + Lifecycle

**职责边界**：
- 负责：瓦片缓存、内存管理、生命周期状态
- 不负责：瓦片选择、渲染

**接口契约**：
```typescript
interface TileCache {
  // 缓存操作
  get(tileKey: string): Tile | null;
  set(tileKey: string, tile: Tile): void;
  evict(tileKey: string): void;
  
  // 内存管理
  setMemoryBudget(bytes: number): void;
  getMemoryUsage(): number;
  
  // 生命周期
  setUnloadPriority(callback: UnloadPriorityCallback): void;
}
```

**落地映射**：
- 现有缓存逻辑分散在各处，需要集中到 `TileCache`
- 实现 LRU 缓存，支持数量限制和字节预算
- 实现瓦片生命周期状态机（UNLOADED → LOADING → LOADED → FAILED）

**no-legacy 约束**：
- 删除旧的简单 Map 缓存，使用 LRU 缓存
- 移除硬编码的缓存大小限制

### 5.9 Terrain/Imagery Composition

**职责边界**：
- 负责：地形和影像的合成、host tile 渲染策略
- 不负责：数据获取、瓦片选择

**接口契约**：
```typescript
interface CompositionEngine {
  // 合成操作
  composeTerrainAndImagery(terrain: TerrainData, imagery: ImageryData): ComposedTile;
  
  // host tile 策略
  getHostTileStrategy(camera: Camera): HostTileStrategy;
  
  // 原子替换
  replaceTile(oldTile: Tile, newTile: Tile): void;
}
```

**落地映射**：
- 现有合成逻辑分散在 `TerrainTileLayer` 和 `RasterLayer`，需要集中
- 实现 Cesium 式的 host tile 渲染策略（祖先影像链合成）
- 支持原子替换，避免闪烁

**no-legacy 约束**：
- 删除旧的简单合成逻辑，使用标准的 host tile 策略
- 移除直接操作 WebGL 的代码，使用统一的材质系统

### 5.10 Crack/Transition Stabilizer

**职责边界**：
- 负责：裂缝消除、过渡稳定、防闪烁
- 不负责：瓦片选择、数据加载

**接口契约**：
```typescript
interface Stabilizer {
  // 裂缝处理
  handleCracks(parentTile: Tile, childTiles: Tile[]): void;
  
  // 过渡稳定
  stabilizeTransition(oldTile: Tile, newTile: Tile): void;
  
  // 防闪烁
  preventFlickering(tile: Tile): void;
}
```

**落地映射**：
- 现有防缝隙机制（skirt + UV inset）需要扩展
- 实现极区处理、穿刺消除、过渡动画
- 支持动态调整稳定参数

**no-legacy 约束**：
- 删除旧的简单裂缝处理，使用标准的稳定机制
- 移除硬编码的稳定参数

### 5.11 Coordinate/Precision System

**职责边界**：
- 负责：坐标转换、精度控制、投影系统
- 不负责：渲染、数据加载

**接口契约**：
```typescript
interface CoordinateSystem {
  // 坐标转换
  wgs84ToCartesian(lng: lat: number): Cartesian3;
  cartesianToWgs84(cartesian: Cartesian3): { lng: lat: number };
  
  // 投影系统
  setProjection(projection: Projection): void;
  project(cartesian: Cartesian3): Vector3;
  
  // 精度控制
  setPrecisionLevel(level: PrecisionLevel): void;
}
```

**落地映射**：
- 现有 `src/geo` 和 `src/projection` 已基本实现，需要进一步优化
- 实现双精度浮点数处理，避免精度抖动
- 支持多种投影系统（WebMercator、Equirectangular、Geographic）

**no-legacy 约束**：
- 删除旧的简化坐标转换，使用标准的转换公式
- 移除硬编码的投影参数

### 5.12 3D Tiles Runtime

**职责边界**：
- 负责：3D Tiles 数据加载、解析、渲染
- 不负责：地球表面管理、影像处理

**接口契约**：
```typescript
interface TilesRuntime {
  // 生命周期
  init(url: string): void;
  update(camera: Camera): void;
  dispose(): void;
  
  // 插件系统
  registerPlugin(plugin: TilesPlugin): void;
  unregisterPlugin(pluginId: string): void;
  
  // 事件系统
  on(event: string, handler: EventHandler): void;
}
```

**落地映射**：
- 完全基于第7章的知识，实现 `TilesRuntimeCore`、`TilesRuntimeAdapter`、`TilesRuntimePlugins`
- 实现三队列模型、LRU 缓存、插件系统
- 支持认证、隐式分块、调试等插件

**no-legacy 约束**：
- 删除旧的简单 3D Tiles 加载代码，使用标准的运行时
- 移除直接依赖具体库的代码，使用适配器模式

### 5.13 Camera/Interaction

**职责边界**：
- 负责：相机控制、用户交互、事件处理
- 不负责：渲染、数据加载

**接口契约**：
```typescript
interface CameraController {
  // 相机控制
  setView(view: CameraView): void;
  getView(): CameraView;
  
  // 交互处理
  enableInteraction(type: InteractionType): void;
  disableInteraction(type: InteractionType): void;
  
  // 事件处理
  on(event: string, handler: EventHandler): void;
}
```

**落地映射**：
- 现有 `src/core/ArcballControl.ts` 已基本实现，需要进一步优化
- 实现统一的交互事件系统（点击、拖拽、缩放）
- 支持触摸手势和键盘快捷键

**no-legacy 约束**：
- 删除旧的简单交互处理，使用标准的事件系统
- 移除硬编码的交互参数

### 5.14 Diagnostics/Test Harness

**职责边界**：
- 负责：性能监控、调试工具、测试框架
- 不负责：业务逻辑、渲染

**接口契约**：
```typescript
interface Diagnostics {
  // 性能监控
  startMonitoring(): void;
  stopMonitoring(): void;
  getMetrics(): PerformanceMetrics;
  
  // 调试工具
  enableDebugMode(): void;
  disableDebugMode(): void;
  
  // 测试框架
  runTests(testSuite: TestSuite): TestResults;
}
```

**落地映射**：
- 现有 `src/utils/PerformanceMonitor.ts` 已基本实现，需要进一步扩展
- 实现可视化调试工具（瓦片边界、SSE 值、缓存状态）
- 支持自动化测试和性能基准测试

**no-legacy 约束**：
- 删除旧的简单日志，使用标准的监控系统
- 移除硬编码的调试参数

---

## 6. 实施路线图

### P0：稳定底座（核心模块）
1. Engine Core 重构
2. Scene/Frame Graph 实现
3. Globe/Surface System 重构
4. Quadtree LOD 实现
5. Request Scheduler 实现
6. Tile Cache + Lifecycle 实现

### P1：质量与正确性（数据模块）
7. Terrain Provider 重构
8. Imagery Provider + Layer Stack 重构
9. Terrain/Imagery Composition 实现
10. Crack/Transition Stabilizer 实现
11. Coordinate/Precision System 优化

### P2：扩展（高级模块）
12. 3D Tiles Runtime 实现
13. Camera/Interaction 优化
14. Diagnostics/Test Harness 扩展

---

## 7. 关键决策点

1. **模块粒度**：每个模块应保持单一职责，避免过大或过小
2. **接口稳定性**：核心接口一旦确定，应保持向后兼容
3. **性能优先**：在保证功能的前提下，优先考虑性能优化
4. **测试覆盖**：每个模块应有完整的单元测试和集成测试
5. **文档完整**：每个模块应有详细的 API 文档和使用示例

---

## 8. 验收标准

满足以下条件可认为引擎蓝图达标：

1. 所有 14 个模块职责清晰，接口明确
2. 依赖方向符合单向原则，无循环依赖
3. 无旧兼容代码，所有实现符合 no-legacy 原则
4. 每个模块有完整的单元测试
5. 性能指标达到预期（帧率、内存使用、加载时间）
6. 文档完整，包含 API 文档、架构图、使用示例

---

## 9. 对应知识库章节

- 模块 4 (Quadtree LOD) ← 02-quadtree-sse-selection.md
- 模块 5+6 (Providers) ← 03-terrain-imagery-decoupling.md
- 模块 7+8 (Scheduler/Cache) ← 04-request-scheduling-cache-lifecycle.md
- 模块 10 (Stabilizer) ← 05-crack-transition-stability.md
- 模块 11 (Coordinate) ← 06-coordinate-system-and-precision.md
- 模块 12 (3D Tiles) ← 07-3dtilesrendererjs-runtime-plugin.md

---

## 10. 下一步行动

1. 根据本蓝图，创建详细的实施计划
2. 优先实现 P0 阶段的核心模块
3. 建立持续集成和自动化测试流程
4. 定期评审和调整实施路线图