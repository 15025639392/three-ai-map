# 04 Request Scheduling Cache Lifecycle

## 1. 请求调度（全局）

Cesium 使用 `RequestScheduler` 统一请求并发治理：

- 全局并发上限：`maximumRequests`
- 每域名并发上限：`maximumRequestsPerServer`
- 优先级堆：动态更新优先级后发起请求
- 可取消：低优先级请求可被挤出

关键源码：

- `packages/engine/Source/Core/RequestScheduler.js`
- `packages/engine/Source/Core/Request.js`
- `packages/engine/Source/Core/Resource.js`

## 2. 生命周期治理

- tile 侧：`TileReplacementQueue`（LRU）+ 本帧使用保护
- imagery 侧：引用计数（`addReference/releaseReference`）
- state machine：TRANSITIONING 阶段禁止随意回收

关键源码：

- `packages/engine/Source/Scene/TileReplacementQueue.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`
- `packages/engine/Source/Scene/Imagery.js`

## 3. three-map 迁移建议

1. 调度器必须升级为“总并发 + 分域并发 + 优先级堆 + cancel”。
2. 缓存必须支持“容量 + 字节数”双阈值。
3. 回收前必须做状态机校验，禁止在过渡态清理。

