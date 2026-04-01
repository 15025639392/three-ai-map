# 04 Request Scheduling Cache Lifecycle

## 1. 目标与边界

本章解决四个工程核心问题：

1. 如何在高频相机移动下控制请求洪峰
2. 如何保证关键瓦片优先加载，而不是“先来先服务”
3. 如何避免缓存抖动（重复请求/刚进刚出）
4. 如何在过渡态安全回收，避免黑块/闪烁

本章聚焦“请求调度 + 缓存 + 生命周期”，不展开裂缝与几何过渡算法（见 `05-crack-transition-stability.md`）。

---

## 2. Cesium 的调度骨架

Cesium 使用 `RequestScheduler` 做全局请求治理，核心不是单个 source 自己排队，而是统一仲裁：

- 全局并发上限：`maximumRequests`
- 每服务端并发上限：`maximumRequestsPerServer`
- 动态优先级队列：每帧可重排
- 请求可取消：低价值请求可被挤出

关键源码：

- `packages/engine/Source/Core/RequestScheduler.js`
- `packages/engine/Source/Core/Request.js`
- `packages/engine/Source/Core/Resource.js`

---

## 3. 请求状态机（建议最小模型）

每个请求建议使用显式状态：

1. `unissued`
2. `queued`
3. `active`
4. `received`
5. `failed`
6. `cancelled`

关键约束：

- 只允许 `queued -> active` 被调度器驱动
- `cancelled` 只能由调度器或宿主失效触发
- `active` 状态必须可打断（AbortController）

---

## 4. 优先级模型（不是固定值）

优先级应由“当前帧渲染价值”动态计算，典型因子：

- 是否阻塞当前可见 tile 的细化
- 与相机距离/屏幕占比
- 是否在当前渲染链上（on-screen）
- 父级是否已可渲染（有 fallback 时可降级）
- 请求年龄（aging，防饿死）

建议队列分层：

1. `critical`：阻塞当前帧细化/消洞
2. `visible`：当前可见但非阻塞
3. `prefetch`：祖先/兄弟/前方预测

---

## 5. 取消策略（必需，不是优化）

不做取消会导致：

- 相机快速移动时持续下载“过期视野”瓦片
- 带宽被低价值请求占满
- 关键路径请求排不到

建议取消触发：

1. tile 已不可见且不在祖先回退链
2. 请求优先级跌破当前队列阈值
3. host tile 生命周期结束（被替换/被淘汰）

---

## 6. 缓存体系：两层而非一层

推荐至少区分：

1. `Source Cache`（原始数据层）
- image/bitmap/elevation 原始 payload

2. `Render Cache`（渲染产物层）
- mesh、纹理引用、GPU 资源句柄、组合中间态

好处：

- 数据重用与 GPU 资源管理解耦
- 可在 CPU 缓存命中的同时重建短生命周期渲染对象

---

## 7. 淘汰策略：容量+字节双阈值

只按数量淘汰会在高分辨率纹理场景失控，建议双阈值：

1. 最大条目数（count）
2. 最大字节数（bytes）

并结合 LRU/clock 策略：

- 本帧被访问对象打“热”标记
- 先淘汰冷对象
- 过渡态对象禁止回收（见第 8 节）

---

## 8. 生命周期安全：过渡态保护

Cesium 里有大量“正在过渡”的 tile/imagery 状态，不能随意回收。

最小保护规则：

1. `TRANSITIONING` / `refining` / `awaiting-child-ready` 不回收
2. 正在被祖先回退链引用的对象不回收
3. 引用计数 > 0 的 imagery 不释放 GPU 资源

关键源码：

- `packages/engine/Source/Scene/TileReplacementQueue.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`
- `packages/engine/Source/Scene/Imagery.js`

---

## 9. 引用计数模型（imagery 必备）

建议为 imagery 资产维护：

- `addReference()`
- `releaseReference()`
- `destroyWhenReferenceZero()`

否则典型问题：

- 多 host tile 共享纹理时被误删
- 释放过晚导致显存持续攀升

---

## 10. 与 three-map 的落地映射

对当前项目建议落地为：

1. `TileScheduler` 升级为全局仲裁器（而非 source 各自孤岛）
2. 引入“总并发 + 分域并发 + 优先级 + aging + cancel”
3. `TileCache` 增加 byte budget 与过渡态保护钩子
4. `SurfaceSystem` 统一持有活动 host 集，向调度器提供优先级上下文

强约束：

- 禁止 layer 私自创建“不可见但不可取消”的长队列
- 禁止缓存策略仅靠 `Map.size`
- 禁止在替换帧回收仍被 fallback 链引用的对象

---

## 11. 典型故障与归因

故障 1：相机拖动时请求数爆炸  
归因：无全局并发上限/无取消  
修复：全局调度 + 过期请求剔除

故障 2：帧率周期性抖动  
归因：缓存抖动（刚淘汰又重下）  
修复：双阈值缓存 + 访问热度保护 + 过渡态禁回收

故障 3：偶发黑块/灰块  
归因：过渡态对象被提前释放  
修复：状态机保护 + 引用计数释放

故障 4：内存长期增长不回落  
归因：imagery 引用未释放或循环引用  
修复：显式 `add/releaseReference` 路径审计

---

## 12. 参考伪代码（可直接实现）

```ts
function scheduleFrameRequests(frameState: FrameState) {
  const candidates = collectRequests(frameState); // terrain + imagery

  for (const req of candidates) {
    req.priority = computePriority(req, frameState);
    if (isObsolete(req, frameState)) {
      cancel(req);
      continue;
    }
    enqueue(req);
  }

  while (hasBudgetGlobal() && hasBudgetPerServer() && hasQueued()) {
    const req = popHighestPriority();
    dispatch(req);
  }
}
```

---

## 13. 验收清单（本章落地标准）

满足以下项可判定调度/缓存体系达标：

1. 相机快速移动时 active 请求数可控且可快速收敛
2. 关键可见 tile 请求明显先于预取请求完成
3. 缓存命中率稳定，无明显抖动型重复下载
4. 过渡帧无因回收引起的黑块/闪烁
5. 内存曲线在稳定视角下可回落到平台区

---

## 14. 对应 Cesium 参考源码

- `packages/engine/Source/Core/RequestScheduler.js`
- `packages/engine/Source/Core/Request.js`
- `packages/engine/Source/Core/Resource.js`
- `packages/engine/Source/Scene/TileReplacementQueue.js`
- `packages/engine/Source/Scene/GlobeSurfaceTile.js`
- `packages/engine/Source/Scene/Imagery.js`

建议阅读顺序：

1. 先看 `RequestScheduler` 的并发与优先级策略
2. 再看 `TileReplacementQueue` 的替换/保活机制
3. 最后看 `Imagery` 引用计数如何与生命周期联动
