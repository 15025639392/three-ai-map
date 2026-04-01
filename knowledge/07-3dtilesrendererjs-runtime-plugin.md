# 07 3DTilesRendererJS Runtime Plugin

## 1. Runtime 架构价值

`3DTilesRendererJS` 的核心价值：把 3D Tiles 运行时做成“可插拔内核”。

- `TilesRendererBase`：遍历、调度、缓存、状态机
- `TilesRenderer(three)`：三维引擎适配
- Plugins：认证、隐式分块、压缩、调试、重定向

关键源码：

- `src/core/renderer/tiles/TilesRendererBase.js`
- `src/three/renderer/tiles/TilesRenderer.js`
- `src/core/plugins/*`
- `src/three/plugins/*`

## 2. 遍历与状态语义

- `used/active/visible/inFrustum/error/distance` 分离
- `optimizedLoadStrategy` 与旧策略并存，强调防闪烁和可见优先
- 父兜底直到子 ready 的策略可直接迁移到地球 surface 子系统

## 3. 调度与缓存

- 三队列并发：download/parse/process
- `PriorityQueue` 负责并发 + 优先级 + 调度
- `LRUCache` 支持 item+bytes 双约束

## 4. 插件边界规则

1. 插件可改 URL/解析/误差/可见性，但不应直接写核心内部结构。
2. 插件必须有优先级和兼容矩阵（哪些策略互斥）。
3. 运行时要提供观测事件：load-start/load-end/error/needs-update。

