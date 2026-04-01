# 09 Validation Checklist

## 1. 功能正确性

### 1.1 基础功能
1. 无 terrain 时影像可稳定显示（ellipsoid host 生效）
2. terrain 开启后按编码正确隆起（如 terrarium）
3. 影像可请求到 provider `maxZoom`（不被 terrain maxZoom 误钳）
4. 极区、反经线、视野边缘无系统性漏瓦片

### 1.2 模块级功能验证（对应第8章蓝图）

#### Engine Core
- [ ] 引擎可正常初始化、启动、停止、销毁
- [ ] 帧循环支持 `continuous` 和 `on-demand` 模式切换
- [ ] 模块注册和注销正常工作
- [ ] 事件总线支持命名空间和优先级

#### Scene/Frame Graph
- [ ] 渲染节点可动态添加和移除
- [ ] 渲染排序策略生效（材质、透明度、图层顺序）
- [ ] 批处理优化减少 draw call

#### Globe/Surface System
- [ ] 瓦片更新和可见性判断正常
- [ ] 瓦片选择算法正确（基于 SSE）
- [ ] 瓦片生命周期管理正常

#### Quadtree LOD
- [ ] 四叉树遍历正确
- [ ] SSE 计算准确（考虑屏幕误差、距离、分辨率）
- [ ] 细化决策符合预期

#### Terrain Provider
- [ ] 地形数据获取正常
- [ ] 高程解码正确（支持 Terrarium、Mapbox 等编码）
- [ ] 缓存和重试策略生效

#### Imagery Provider + Layer Stack
- [ ] 影像数据获取正常
- [ ] 图层混合正确（支持多种混合模式）
- [ ] 图层顺序动态调整生效

#### Request Scheduler
- [ ] 请求队列管理正常
- [ ] 并发控制生效
- [ ] 优先级排序正确

#### Tile Cache + Lifecycle
- [ ] 缓存操作正常（get/set/evict）
- [ ] 内存管理生效（数量限制和字节预算）
- [ ] 生命周期状态机正常

#### Terrain/Imagery Composition
- [ ] 地形和影像合成正确
- [ ] host tile 渲染策略生效（祖先影像链合成）
- [ ] 原子替换避免闪烁

#### Crack/Transition Stabilizer
- [ ] 裂缝消除有效
- [ ] 过渡稳定生效
- [ ] 防闪烁机制正常

#### Coordinate/Precision System
- [ ] 坐标转换准确
- [ ] 投影系统正常
- [ ] 精度控制生效

#### 3D Tiles Runtime
- [ ] 3D Tiles 数据加载正常
- [ ] 插件系统可插拔
- [ ] 事件系统正常

#### Camera/Interaction
- [ ] 相机控制正常
- [ ] 交互事件处理正确
- [ ] 触摸手势支持正常

#### Diagnostics/Test Harness
- [ ] 性能监控数据准确
- [ ] 调试工具可用
- [ ] 自动化测试可运行

---

## 2. 稳定性

### 2.1 渲染稳定性
1. 不出现 `globeMesh/imagery/terrain` 交替闪烁
2. 父级保留 + 子级就绪后原子替换生效
3. 无黑块/灰块占位穿刺
4. 缩放/平移高频操作下无持续抖动和方向反转

### 2.2 模块交互稳定性
- [ ] 模块间通信无竞态条件
- [ ] 事件驱动无循环依赖
- [ ] 内存泄漏检测通过
- [ ] 长时间运行无性能退化

### 2.3 数据稳定性
- [ ] 网络请求失败不影响主流程
- [ ] 数据解析错误有优雅降级
- [ ] 缓存一致性保证

---

## 3. 性能

### 3.1 渲染性能
1. 合成路径为单 pass 或可控 pass
2. 请求队列无风暴（并发受控）
3. 缓存回收无“抖动式装卸”
4. 显存与 CPU 内存增长可预测并受阈值限制

### 3.2 模块级性能指标
- [ ] Engine Core 帧循环延迟 < 16ms（60fps）
- [ ] Scene/Frame Graph 渲染排序时间 < 1ms
- [ ] Globe/Surface System 瓦片选择时间 < 2ms
- [ ] Quadtree LOD 遍历时间 < 1ms
- [ ] Terrain Provider 数据获取延迟 < 100ms（网络相关）
- [ ] Imagery Provider 图层混合时间 < 2ms
- [ ] Request Scheduler 队列管理开销 < 0.1ms
- [ ] Tile Cache 缓存操作时间 < 0.1ms
- [ ] Terrain/Imagery Composition 合成时间 < 3ms
- [ ] Crack/Transition Stabilizer 处理时间 < 1ms
- [ ] Coordinate/Precision System 转换时间 < 0.1ms
- [ ] 3D Tiles Runtime 更新时间 < 5ms
- [ ] Camera/Interaction 事件处理延迟 < 1ms
- [ ] Diagnostics/Test Harness 监控开销 < 0.5ms

### 3.3 资源使用
- [ ] 内存使用稳定，无持续增长
- [ ] 显存使用受控，有明确的预算限制
- [ ] 网络请求并发数符合配置
- [ ] CPU 使用率在合理范围内

---

## 4. 诊断能力

### 4.1 运行时可观测性
1. 可查看 queued/downloading/parsing/loaded/failed
2. 可查看 active/visible/used tile 计数
3. 可追踪单 tile 生命周期与替换路径
4. 可一键打开 debug overlay（边界、level、error）

### 4.2 模块级诊断
- [ ] Engine Core 状态可查询（帧率、模块列表）
- [ ] Scene/Frame Graph 渲染节点可枚举
- [ ] Globe/Surface System 瓦片树可可视化
- [ ] Quadtree LOD SSE 值可显示
- [ ] Terrain Provider 请求状态可追踪
- [ ] Imagery Provider 图层状态可查看
- [ ] Request Scheduler 队列状态可监控
- [ ] Tile Cache 缓存使用情况可统计
- [ ] Terrain/Imagery Composition 合成过程可调试
- [ ] Crack/Transition Stabilizer 参数可调整
- [ ] Coordinate/Precision System 转换过程可追踪
- [ ] 3D Tiles Runtime 插件状态可查看
- [ ] Camera/Interaction 事件日志可记录
- [ ] Diagnostics/Test Harness 测试结果可导出

### 4.3 调试工具
- [ ] 瓦片边界可视化
- [ ] SSE 值热力图
- [ ] 缓存命中率统计
- [ ] 网络请求时间线
- [ ] 内存使用图表
- [ ] 渲染帧时间图表

---

## 5. 必备回归场景

### 5.1 基础回归
1. 全球低空横移（跨经线）
2. 极区缩放和旋转
3. 高频 zoom in/out 循环
4. 只开影像、只开地形、影像+地形、叠加 3DTiles 四组组合

### 5.2 模块级回归
- [ ] Engine Core 重启测试
- [ ] Scene/Frame Graph 动态节点添加/移除
- [ ] Globe/Surface System 瓦片选择边界情况
- [ ] Quadtree LOD 极区和反经线处理
- [ ] Terrain Provider 编码格式切换
- [ ] Imagery Provider 图层顺序动态调整
- [ ] Request Scheduler 并发限制调整
- [ ] Tile Cache 内存预算调整
- [ ] Terrain/Imagery Composition host tile 策略切换
- [ ] Crack/Transition Stabilizer 参数动态调整
- [ ] Coordinate/Precision System 投影系统切换
- [ ] 3D Tiles Runtime 插件动态加载/卸载
- [ ] Camera/Interaction 交互模式切换
- [ ] Diagnostics/Test Harness 测试套件运行

### 5.3 集成回归
- [ ] 多模块协同工作（如 Surface + Provider + Cache）
- [ ] 事件驱动链路完整性
- [ ] 错误传播和降级处理
- [ ] 资源竞争和死锁检测

### 5.4 性能回归
- [ ] 帧率稳定性测试（长时间运行）
- [ ] 内存泄漏检测（24小时运行）
- [ ] 网络波动适应性测试
- [ ] 大数据量压力测试

---

## 6. 验证方法与工具

### 6.1 自动化测试
- [ ] 单元测试：每个模块有完整的单元测试覆盖
- [ ] 集成测试：模块间交互有集成测试
- [ ] 端到端测试：完整用户场景有端到端测试
- [ ] 性能测试：关键路径有性能基准测试

### 6.2 手动验证
- [ ] 视觉验证：渲染结果符合预期
- [ ] 交互验证：用户操作响应正确
- [ ] 边界验证：极端情况处理正确
- [ ] 兼容性验证：不同浏览器和设备支持

### 6.3 监控工具
- [ ] 性能监控：实时帧率、内存、网络监控
- [ ] 错误监控：异常和错误自动上报
- [ ] 用户行为监控：交互路径分析
- [ ] 资源使用监控：CPU、内存、网络资源使用

### 6.4 调试工具
- [ ] WebGL 调试器：渲染管线调试
- [ ] 网络调试器：请求响应分析
- [ ] 内存分析器：内存使用分析
- [ ] 性能分析器：热点函数分析

---

## 7. 验收标准

### 7.1 功能验收
- [ ] 所有功能验证点通过
- [ ] 无阻塞性缺陷
- [ ] 用户场景完整覆盖

### 7.2 性能验收
- [ ] 帧率稳定在 60fps（或目标帧率）
- [ ] 内存使用符合预算
- [ ] 网络请求效率达标

### 7.3 稳定性验收
- [ ] 长时间运行无崩溃
- [ ] 异常处理优雅降级
- [ ] 资源泄漏检测通过

### 7.4 可维护性验收
- [ ] 代码结构清晰，符合蓝图设计
- [ ] 接口定义明确，文档完整
- [ ] 测试覆盖充分，自动化程度高

---

## 8. 与第8章蓝图的对应关系

| 蓝图模块 | 验证重点 | 关键指标 |
|---------|---------|---------|
| Engine Core | 生命周期管理、帧循环 | 启动时间、帧率稳定性 |
| Scene/Frame Graph | 渲染排序、批处理 | draw call 数量、排序时间 |
| Globe/Surface System | 瓦片选择、可见性 | 选择准确率、更新延迟 |
| Quadtree LOD | SSE 计算、遍历 | 计算精度、遍历时间 |
| Terrain Provider | 数据获取、解码 | 获取延迟、解码准确率 |
| Imagery Provider + Layer Stack | 图层混合、顺序 | 混合正确率、调整响应时间 |
| Request Scheduler | 队列管理、并发 | 队列长度、并发控制 |
| Tile Cache + Lifecycle | 缓存效率、内存管理 | 命中率、内存使用 |
| Terrain/Imagery Composition | 合成策略、原子替换 | 合成质量、替换闪烁 |
| Crack/Transition Stabilizer | 裂缝消除、过渡稳定 | 裂缝可见度、过渡平滑度 |
| Coordinate/Precision System | 坐标转换、精度 | 转换精度、抖动控制 |
| 3D Tiles Runtime | 插件系统、事件 | 插件加载时间、事件延迟 |
| Camera/Interaction | 交互响应、手势 | 交互延迟、手势识别率 |
| Diagnostics/Test Harness | 监控覆盖、测试 | 监控数据准确性、测试通过率 |

---

## 9. 验证流程

### 9.1 开发阶段验证
1. 单元测试：编写代码时同步编写测试
2. 集成测试：模块完成后进行集成测试
3. 代码审查：通过审查确保质量

### 9.2 测试阶段验证
1. 功能测试：按验证清单逐项测试
2. 性能测试：运行性能基准测试
3. 回归测试：执行回归测试套件

### 9.3 发布阶段验证
1. 验收测试：按验收标准进行测试
2. 兼容性测试：在不同环境测试
3. 用户验收：最终用户确认

---

## 10. 持续改进

### 10.1 验证覆盖度监控
- [ ] 定期审查测试覆盖率
- [ ] 发现缺失的测试用例
- [ ] 补充边界情况测试

### 10.2 性能基准更新
- [ ] 定期更新性能基准
- [ ] 识别性能退化
- [ ] 优化关键路径

### 10.3 验证工具演进
- [ ] 评估新工具和技术
- [ ] 改进调试和监控能力
- [ ] 提高自动化程度