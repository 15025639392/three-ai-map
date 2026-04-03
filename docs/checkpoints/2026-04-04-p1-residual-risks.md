# P1 残余风险记录

更新时间：2026-04-04

## 当前结论

P1 已完成并通过当前门禁：

- `npm run test:map-engine`
- `npm run test:metrics:baseline`
- `npm run typecheck`

可以开始 P2。

## 残余风险

### 1. 统计型 smoke 仍不是像素级视觉回归

现状：

- `surface-tiles`、`raster-ellipsoid-host` 等浏览器 smoke 已覆盖 `phase`、`fillEdgeCount`、`maxNeighborLodDelta`、`crackDetectedCount`、host swap / fallback 等关键统计指标。
- 这些门禁能发现大量状态机、计数链路和收敛行为回归。

缺口：

- 仍有一类问题可能漏掉：画面上出现短暂细裂缝、单帧覆盖重叠、局部闪烁，但计数逻辑本身未变。
- 也就是说，当前 smoke 更像“统计型行为门禁”，还不是“像素级视觉回归”。

后续补强建议：

- 为关键场景增加截图基线或区域级像素 diff。
- 优先覆盖：
  - `surface-tile-zoom-regression`
  - `raster-layer-ellipsoid-host-regression`
  - `surface-tile-recovery-stages-regression`
- 只对关键阶段截图，不做全量逐帧 diff，避免门禁过重。

### 2. Raster / Terrain 的真实 severity 与 recovery 失败路径回归仍偏弱

现状：

- `RecoveryPolicy` 和 `ErrorEvent` 的引擎级统一计数与事件链路已经接上。
- `VectorTileLayer` 的 severity 语义已有集成测试覆盖。

缺口：

- `RasterLayer`、`TerrainTileLayer` 仍缺少和 `VectorTileLayer` 同等强度的失败路径回归。
- 当前更多是在验证：
  - 引擎级计数 API 是否存在
  - recovery query/hit/rule-hit 是否统计
  - vector 未知失败的 severity 是否保真

还没充分覆盖：

- raster 网络失败后 `recoverable=true` / `severity=warn` 的事件负载是否稳定
- terrain 高程加载失败后 recoverable 事件和重试策略是否命中
- recovery 计数是否与真实 raster / terrain 失败路径保持同步，而不是只靠 probe layer

后续补强建议：

- 新增集成测试：
  - `RasterErrorEvent.integration.test.ts`
  - `TerrainErrorEvent.integration.test.ts`
  - `RasterRecoveryPolicy.integration.test.ts`
  - `TerrainRecoveryPolicy.integration.test.ts`
- 优先覆盖：
  - imagery target 失败 + fallbackColor
  - imagery retry exhausted
  - elevation tile load failure
  - elevation retry policy hit / miss

## 建议执行顺序

如果马上进入 P2，建议这样处理：

1. 先开始 P2 主线，不阻塞新能力建设。
2. 在 P2 的第一个稳定里程碑后，补“像素级视觉回归”。
3. 再补 raster / terrain 的真实失败路径回归。

这样不会打断 P2 推进，同时能在下一轮质量收口时把 P1 的尾巴补齐。
