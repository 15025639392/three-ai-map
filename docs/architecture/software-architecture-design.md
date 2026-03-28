# Three-Map 大型地图引擎架构设计

**日期**: 2026-03-28  
**版本**: 1.0  
**架构师**: 软件架构师 Agent  
**状态**: 提议  

## 1. 系统概览

### 1.1 业务目标
- 构建高性能、可扩展的 Web 端 3D 地图引擎
- 支持大规模地理数据可视化（百万级要素）
- 提供丰富的交互体验和定制能力
- 保持轻量化设计，确保快速加载和高性能运行
- 支持多数据源、多投影、多坐标系

### 1.2 质量属性
| 质量属性 | 目标 | 优先级 |
|----------|------|--------|
| 性能 | 60+ FPS (4K 瓦片), 10000+ 标记点 | P0 |
| 可扩展性 | 支持插件化图层扩展、自定义渲染器 | P0 |
| 可维护性 | 模块化设计、清晰的边界上下文 | P0 |
| 可用性 | 完善的 API 文档、示例、错误处理 | P1 |
| 兼容性 | 支持主流浏览器、移动设备 | P1 |
| 安全性 | 支持 CORS、输入验证、防注入 | P2 |

### 1.3 约束
- **技术栈**: TypeScript + Three.js + Rspack
- **浏览器支持**: Chrome >= 90, Firefox >= 88, Safari >= 14
- **包体积**: < 300KB (gzipped)
- **内存限制**: < 500MB (复杂场景)
- **并发请求**: 浏览器默认限制 (6-8)

## 2. 架构模式与原则

### 2.1 核心架构模式
- **分层架构**: 应用层 → 服务层 → 核心层 → 基础设施层
- **事件驱动**: 基于发布订阅模式的状态通知
- **组件化**: 可插拔的图层系统和渲染器
- **面向接口**: 定义清晰的契约，支持实现替换

### 2.2 设计原则
1. **单一职责原则**: 每个模块/类只负责一个功能领域
2. **开闭原则**: 对扩展开放，对修改关闭
3. **依赖倒置**: 高层模块不依赖低层模块，都依赖抽象
4. **接口隔离**: 客户端不应依赖不需要的接口
5. **最小惊讶原则**: API 设计符合直觉，减少认知负担

### 2.3 架构决策
- 选择 **模块化单体** 而非微服务 (当前规模，统一团队)
- 采用 **插件化架构** 而非硬编码扩展
- 实施 **渐进式增强** 而非功能全集
- 优先 **性能优化** 而非功能完整性

## 3. 系统架构设计

### 3.1 分层架构视图

```
┌─────────────────────────────────────────────────────┐
│                   应用层 (Application Layer)         │
├─────────────────────────────────────────────────────┤
│  GlobeEngine API | 图层管理 | 事件系统 | 动画控制器  │
├─────────────────────────────────────────────────────┤
│                    服务层 (Service Layer)            │
├─────────────────────────────────────────────────────┤
│ 瓦片服务 | 数据服务 | 坐标服务 | 样式服务 | 缓存服务 │
├─────────────────────────────────────────────────────┤
│                    核心层 (Core Layer)               │
├─────────────────────────────────────────────────────┤
│ 渲染引擎 | 空间索引 | 几何计算 | 投影系统 | 物理引擎 │
├─────────────────────────────────────────────────────┤
│                基础设施层 (Infrastructure Layer)     │
└─────────────────────────────────────────────────────┘
     WebGL | Web Workers | 网络请求 | 本地存储 | DOM
```

### 3.2 组件图

```
┌─────────────────────────────────────────────────────────┐
│                      GlobeEngine                         │
├─────────────┬──────────────┬─────────────┬──────────────┤
│  渲染循环   │   图层管理器  │  事件总线   │  动画管理器  │
├─────────────┼──────────────┼─────────────┼──────────────┤
│  相机系统   │   交互控制    │  视口管理   │  性能监控    │
└─────────────┴──────────────┴─────────────┴──────────────┘
        │               │               │              │
        ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                      图层系统                           │
├──────┬──────┬──────┬──────┬──────┬──────┬──────┬───────┤
│ 影像 │ 高程 │ 矢量 │ 标记 │ 折线 │ 多边形│ 热力图│ 自定义│
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴───────┘
        │               │               │              │
        ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                   数据管道与缓存                        │
├─────────────┬──────────────┬─────────────┬──────────────┤
│ 瓦片加载器  │ 数据解码器   │ 缓存策略    │ 调度器       │
└─────────────┴──────────────┴─────────────┴──────────────┘
```

### 3.3 限界上下文映射

| 限界上下文 | 职责 | 核心模型 | 与其他上下文关系 |
|------------|------|----------|------------------|
| **渲染上下文** | WebGL 渲染、着色器、材质 | Renderer, Scene, Camera | 使用几何上下文的数据 |
| **几何上下文** | 空间计算、坐标转换、投影 | Geometry, Projection, Coordinate | 向渲染上下文提供数据 |
| **瓦片上下文** | 瓦片加载、缓存、调度 | Tile, Cache, Scheduler | 向图层上下文提供瓦片 |
| **图层上下文** | 图层管理、样式、可见性 | Layer, Style, Visibility | 使用瓦片上下文的数据 |
| **交互上下文** | 用户输入、拾取、手势 | Interaction, Picking, Gesture | 依赖相机上下文状态 |
| **相机上下文** | 视图控制、动画、路径 | Camera, View, Animation | 被交互上下文使用 |

## 4. 关键架构决策记录

### ADR-001: 渲染架构选择
**状态**: 已接受  
**上下文**: 需要支持复杂的 3D 地图渲染，包括地形、影像、矢量、标记等  
**决策**: 采用 Three.js 作为渲染引擎，但构建自己的图层管理系统和渲染管道  
**理由**: 
- Three.js 提供成熟的 WebGL 抽象，避免底层 API 复杂性
- 可定制化渲染管道以适应地图特定需求（如 LOD、瓦片裁剪）
- 保持与社区生态兼容，可利用现有插件和工具
**后果**:
- (+) 开发效率高，社区支持好
- (+) 性能优化有现成方案
- (-) 包体积增加 (~500KB)
- (-) 某些高级特性受 Three.js 限制

### ADR-002: 数据流架构
**状态**: 已接受  
**上下文**: 需要处理异步的瓦片加载、解码、渲染流程  
**决策**: 采用观察者模式 + 状态机管理数据流  
**理由**:
- 清晰分离数据获取、处理、渲染阶段
- 支持异步操作和错误恢复
- 便于实现缓存和预加载策略
**数据流**:
```
数据源 → 加载器 → 解码器 → 缓存 → 渲染器 → 屏幕
   ↑        ↑        ↑        ↑        ↑
调度器 ← 优先级 ← 可见性 ← 相机 ← 交互
```

### ADR-003: 内存管理策略
**状态**: 已接受  
**上下文**: 地图应用可能加载大量瓦片和几何数据  
**决策**: 实施分级缓存 + 引用计数 + 自动垃圾回收  
**策略**:
1. **LRU 缓存**: 最近最少使用的瓦片优先移除
2. **层级缓存**: 内存 → 磁盘 → 网络
3. **智能预加载**: 基于视口和移动方向预加载
4. **延迟卸载**: 非关键资源延迟回收

## 5. 模块详细设计

### 5.1 核心引擎模块 (GlobeEngine)

```typescript
interface IGlobeEngine {
  // 生命周期
  initialize(config: EngineConfig): Promise<void>;
  destroy(): void;
  
  // 图层管理
  addLayer(layer: ILayer): string;
  removeLayer(layerId: string): boolean;
  getLayer(layerId: string): ILayer | null;
  
  // 视图控制
  setView(view: ViewState, options?: AnimationOptions): Promise<void>;
  getView(): ViewState;
  flyTo(destination: ViewState, options?: FlyOptions): Promise<void>;
  
  // 事件系统
  on(event: EngineEvent, handler: EventHandler): void;
  off(event: EngineEvent, handler: EventHandler): void;
  emit(event: EngineEvent, data?: any): void;
  
  // 实用工具
  pick(coordinates: ScreenCoordinates): PickResult | null;
  project(geo: GeoCoordinates): ScreenCoordinates;
  unproject(screen: ScreenCoordinates): GeoCoordinates;
  
  // 性能监控
  getStats(): EngineStats;
}
```

### 5.2 图层系统架构

#### 图层基类设计
```typescript
abstract class BaseLayer implements ILayer {
  protected constructor(
    public readonly id: string,
    protected options: LayerOptions
  ) {}
  
  // 生命周期钩子
  abstract onAdd(engine: IGlobeEngine): void;
  abstract onRemove(): void;
  abstract update(deltaTime: number): void;
  abstract render(renderer: IRenderer): void;
  
  // 状态管理
  abstract setVisible(visible: boolean): void;
  abstract getVisible(): boolean;
  abstract setOpacity(opacity: number): void;
  abstract getOpacity(): number;
  
  // 数据接口
  abstract setData(data: LayerData): void;
  abstract clear(): void;
}
```

#### 图层类型分类
| 类型 | 特点 | 使用场景 |
|------|------|----------|
| **瓦片图层** | 基于网格的LOD系统，异步加载 | 影像、高程、矢量瓦片 |
| **矢量图层** | 几何要素渲染，支持样式 | 点线面数据可视化 |
| **标记图层** | 实例化渲染，高效 | 大量POI标记 |
| **热力图层** | 密度可视化，GPU加速 | 热点分析 |
| **自定义图层** | 用户自定义渲染逻辑 | 特殊可视化需求 |

### 5.3 渲染管道设计

```
渲染循环:
  1. 收集可见图层
  2. 按优先级排序
  3. 执行图层更新
  4. 构建渲染队列
  5. 执行渲染
  6. 应用后处理
  7. 呈现到屏幕
  8. 收集性能数据
```

#### 渲染优先级
1. **地形/高程** (基础几何)
2. **影像瓦片** (地表纹理)
3. **矢量数据** (道路、边界)
4. **标记/标注** (POI、标签)
5. **特效/后处理** (大气、光晕)

### 5.4 空间索引与查询

#### R-Tree 索引设计
```typescript
class SpatialIndex<T extends SpatialObject> {
  // 索引操作
  insert(object: T): void;
  remove(object: T): boolean;
  update(object: T): void;
  
  // 查询操作
  query(bbox: BoundingBox): T[];
  queryPoint(point: GeoCoordinates, radius?: number): T[];
  queryPolygon(polygon: GeoCoordinates[]): T[];
  
  // 批量操作
  bulkInsert(objects: T[]): void;
  clear(): void;
  
  // 性能优化
  optimize(): void;
  getStats(): SpatialIndexStats;
}
```

#### 查询优化策略
1. **分层索引**: 全球级 → 区域级 → 局部级
2. **LOD 索引**: 不同细节级别建立不同索引
3. **空间哈希**: 快速近似查询
4. **预计算网格**: 静态数据预计算查询结果

## 6. 性能架构设计

### 6.1 渲染性能优化

#### GPU 优化
- **实例化渲染**: 标记点、图标使用 InstancedMesh
- **合并绘制调用**: 相似材质/几何合并批次
- **GPU 粒子系统**: 大量动态效果使用 GPU 粒子
- **着色器优化**: 使用低精度、简化计算

#### CPU 优化
- **工作线程**: 瓦片解码、几何计算使用 Web Workers
- **增量更新**: 只更新变化的部分
- **对象池**: 重用几何对象，减少 GC
- **延迟计算**: 非关键计算延后执行

#### 内存优化
- **纹理压缩**: 使用压缩纹理格式
- **几何压缩**: 量化、简化顶点数据
- **资源复用**: 共享材质、几何体
- **按需加载**: 只在需要时加载资源

### 6.2 加载性能优化

#### 瓦片加载策略
```typescript
interface TileLoadingStrategy {
  // 预加载策略
  preloadTiles: 'viewport' | 'direction' | 'path';
  preloadDistance: number; // 瓦片数量
  
  // 加载优先级
  priority: {
    center: number;    // 中心区域
    near: number;      // 近处
    far: number;       // 远处
    offscreen: number; // 屏幕外
  };
  
  // 并发控制
  maxConcurrent: number;
  retryPolicy: {
    maxRetries: number;
    backoff: 'linear' | 'exponential';
  };
}
```

#### 渐进式增强
1. **基础几何**: 立即显示程序化地球
2. **低清瓦片**: 快速加载低分辨率影像
3. **高清瓦片**: 渐进加载高分辨率
4. **矢量数据**: 最后加载样式化数据

### 6.3 网络优化

#### 缓存策略
```typescript
interface CacheStrategy {
  // 缓存层级
  memory: {
    enabled: boolean;
    maxSize: number; // MB
    ttl: number;     // 毫秒
  };
  
  disk: {
    enabled: boolean;
    maxSize: number; // MB
    ttl: number;     // 毫秒
  };
  
  // 预取策略
  prefetch: {
    enabled: boolean;
    strategy: 'predictive' | 'adaptive';
    lookahead: number; // 瓦片数量
  };
}
```

## 7. 扩展性设计

### 7.1 插件系统架构

```typescript
interface IPlugin {
  name: string;
  version: string;
  
  // 插件生命周期
  install(engine: IGlobeEngine): void;
  uninstall(): void;
  
  // 插件能力
  capabilities?: PluginCapability[];
}

// 插件管理器
class PluginManager {
  register(plugin: IPlugin): void;
  unregister(pluginName: string): void;
  getPlugin(pluginName: string): IPlugin | null;
  enable(pluginName: string): void;
  disable(pluginName: string): void;
  
  // 插件发现
  discoverFromRegistry(registryUrl: string): Promise<IPlugin[]>;
  loadFromUrl(url: string): Promise<IPlugin>;
}
```

### 7.2 扩展点设计

#### 可扩展的渲染器
```typescript
interface IRendererExtension {
  // 渲染阶段扩展
  beforeRender?: (scene: Scene, camera: Camera) => void;
  afterRender?: (scene: Scene, camera: Camera) => void;
  
  // 着色器扩展
  modifyShader?: (material: Material, shader: Shader) => void;
  
  // 几何扩展
  createGeometry?: (data: any) => BufferGeometry;
}
```

#### 可扩展的数据源
```typescript
interface IDataSource {
  // 数据获取
  fetchData(bbox: BoundingBox, zoom: number): Promise<any>;
  
  // 格式支持
  supportedFormats: DataFormat[];
  
  // 转换器
  transform?: (rawData: any) => LayerData;
}
```

### 7.3 配置系统

```typescript
class ConfigurationManager {
  // 分层配置
  defaults: EngineDefaults;
  environment: EnvironmentConfig;
  user: UserPreferences;
  runtime: RuntimeOptions;
  
  // 配置合并策略
  mergeStrategy: 'deep' | 'shallow' | 'custom';
  
  // 配置更新
  update(config: Partial<EngineConfig>): void;
  get<T>(path: string): T;
  set<T>(path: string, value: T): void;
  
  // 配置持久化
  saveToStorage(key: string): void;
  loadFromStorage(key: string): void;
}
```

## 8. 错误处理与监控

### 8.1 错误分类与处理

| 错误类型 | 级别 | 处理策略 | 用户反馈 |
|----------|------|----------|----------|
| 网络错误 | WARN | 重试、降级、缓存回退 | 轻量提示 |
| 渲染错误 | ERROR | 回退渲染器、禁用特性 | 适度提示 |
| 数据错误 | WARN | 数据清理、忽略异常 | 日志记录 |
| 内存错误 | FATAL | 资源释放、重启引擎 | 严重提示 |
| 配置错误 | ERROR | 使用默认值、抛出异常 | 配置向导 |

### 8.2 监控体系

```typescript
interface MonitoringSystem {
  // 性能监控
  performance: {
    fps: FPSMonitor;
    memory: MemoryMonitor;
    render: RenderTimeMonitor;
    network: NetworkMonitor;
  };
  
  // 错误监控
  errors: {
    capture(error: Error, context?: ErrorContext): void;
    getReports(): ErrorReport[];
    clear(): void;
  };
  
  // 使用分析
  analytics: {
    trackEvent(event: AnalyticsEvent): void;
    getUserJourney(): UserJourney;
    getHeatmap(): InteractionHeatmap;
  };
  
  // 诊断工具
  diagnostics: {
    generateReport(): DiagnosticReport;
    exportProfiles(): ProfileData[];
  };
}
```

## 9. 部署与构建架构

### 9.1 构建策略

```typescript
// rspack.config.ts 扩展
const config: RspackConfig = {
  // 代码分割策略
  splitChunks: {
    chunks: 'async',
    minSize: 20000,
    cacheGroups: {
      core: {
        test: /[\\/]src[\\/](core|engine|geo)/,
        name: 'core',
        chunks: 'initial',
        priority: 10,
      },
      layers: {
        test: /[\\/]src[\\/]layers[\\/]/,
        name: 'layers',
        chunks: 'async',
        priority: 5,
      },
      three: {
        test: /[\\/]node_modules[\\/]three[\\/]/,
        name: 'three',
        chunks: 'initial',
        priority: 20,
      },
    },
  },
  
  // 压缩优化
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
          },
        },
      }),
    ],
  },
};
```

### 9.2 发布流程

```
开发 → 测试 → 构建 → 发布 → 监控
   ↓     ↓     ↓     ↓     ↓
特性分支 → 单元测试 → 生产构建 → CDN部署 → 错误跟踪
         ↓           ↓           ↓         ↓
       集成测试 → 包体积检查 → 版本标记 → 性能监控
```

## 10. 演进路线图

### 阶段 1: 核心稳固 (3个月)
- 完善现有架构，修复已知问题
- 添加完整测试覆盖
- 优化基础性能
- 完善 API 文档

### 阶段 2: 功能扩展 (6个月)
- 实现矢量瓦片支持
- 添加高级图层类型
- 扩展投影系统
- 完善工具链

### 阶段 3: 高级特性 (9个月)
- 实现离线支持
- 添加 AR/VR 扩展
- 支持复杂分析功能
- 构建插件市场

### 阶段 4: 生态建设 (12个月+)
- 建立开发者社区
- 提供云服务集成
- 支持企业级部署
- 国际化支持

## 11. 风险评估与缓解

### 技术风险
1. **Three.js 版本兼容性**
   - **风险**: 新版本可能破坏现有功能
   - **缓解**: 锁定版本，建立升级测试流程
   
2. **浏览器兼容性**
   - **风险**: 新 API 支持不一致
   - **缓解**: 特性检测，渐进增强，polyfill
   
3. **性能瓶颈**
   - **风险**: 复杂场景性能下降
   - **缓解**: 性能预算，监控告警，优化预案

### 业务风险
1. **需求变更**
   - **风险**: 架构无法适应新需求
   - **缓解**: 模块化设计，预留扩展点
   
2. **团队技能**
   - **风险**: 团队成员技能不匹配
   - **缓解**: 详细文档，培训计划，代码审查

### 运营风险
1. **用户增长**
   - **风险**: 架构无法支撑用户增长
   - **缓解**: 性能测试，容量规划，水平扩展设计

## 12. 附录

### 12.1 技术选型矩阵

| 技术领域 | 选型 | 备选方案 | 选型理由 |
|----------|------|----------|----------|
| 渲染引擎 | Three.js | Babylon.js, PlayCanvas | 社区生态，成熟度，灵活性 |
| 构建工具 | Rspack | Webpack, Vite, esbuild | 性能，配置简洁，TypeScript 支持 |
| 测试框架 | Vitest | Jest, Mocha | 速度，Vite 集成，TypeScript 支持 |
| 类型系统 | TypeScript | JavaScript, Flow | 类型安全，开发体验，生态 |
| 代码规范 | ESLint + Prettier | 无 | 代码质量，一致性，自动化 |

### 12.2 性能指标基准

| 指标 | 目标值 | 测量方法 | 验收标准 |
|------|--------|----------|----------|
| 首次渲染时间 | < 2s | Navigation Timing API | 90% 用户满足 |
| 交互响应时间 | < 100ms | RAIL 模型 | 95% 操作满足 |
| 内存使用峰值 | < 500MB | Performance API | 复杂场景不崩溃 |
| 包体积 (gzipped) | < 300KB | Bundle Analyzer | 生产构建 |
| FPS (复杂场景) | > 30 | requestAnimationFrame | 90% 帧满足 |

### 12.3 代码质量指标

| 指标 | 目标值 | 工具 | 频率 |
|------|--------|------|------|
| 测试覆盖率 | > 80% | Vitest | 每次提交 |
| 类型覆盖率 | > 95% | TypeScript | 每次构建 |
| 代码重复率 | < 5% | jscpd | 每周 |
| 圈复杂度 | < 10 | ESLint | 每次提交 |
| 依赖数量 | < 50 | npm ls | 每次更新 |

---

**文档版本历史**
- v1.0 (2026-03-28): 初始架构设计
- v1.1 (计划): 根据实现反馈调整
- v2.0 (计划): 重大架构演进

**下一步行动**
1. 评审架构设计
2. 创建详细技术规范
3. 实施原型验证关键决策
4. 制定详细开发计划