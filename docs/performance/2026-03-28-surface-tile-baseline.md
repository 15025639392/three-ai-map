# SurfaceTile 性能基线（2026-03-28）

## 场景

- 命令：`npm run test:browser:surface-tiles`
- 采样页面：`examples/surface-tile-zoom-regression.ts`
- 指标文件：`test-results/surface-tile-zoom-regression-metrics.json`
- DOM 快照：`test-results/surface-tile-zoom-regression-smoke.html`
- 截图：`test-results/surface-tile-zoom-regression-smoke.png`
- 指标来源：`GlobeEngine#getPerformanceReport()` + `SurfaceTileLayer#getDebugStats()`

## 基线结果

- 日期：2026-03-28
- before tiles：`2/2/1,2/3/1`
- after tiles：`4/8/4,4/8/5,4/9/4,4/9/5`
- average FPS：`90.81`
- latest frame time：`0ms`
- frame drops：`3`
- imagery requests：`14`
- imagery cancelled：`8`
- imagery cancel ratio：`57.14%`
- elevation requests：`6`
- elevation cancelled：`0`
- used JS heap size：`5846045` bytes
- recovery policy query count：`14`
- recovery policy hit count：`0`
- recovery policy rule-hit count：`0`
- recovery policy imagery query count：`14`
- recovery policy imagery hit count：`0`
- recovery policy imagery rule-hit count：`0`

## 多 stage 恢复阈值回归（v1.3）

- 采样页面：`examples/surface-tile-recovery-stages-regression.ts`
- 指标文件：`test-results/surface-tile-recovery-stages-regression-metrics.json`
- tile-load recovery query/hit/rule-hit：`4 / 4 / 4`
- tile-parse recovery query/hit/rule-hit：`1 / 1 / 1`
- smoke 阈值（上限）：tile-load `<= 8`、tile-parse `<= 4`

### 阈值调参依据

- tile-load 探针固定触发 4 次恢复查询，阈值设为 `8`（2x 冗余）用于防止异常放大且保留轻微实现波动空间。
- tile-parse 探针固定触发 1 次恢复查询，阈值设为 `4`（4x 冗余）用于覆盖重试/预热微抖动，同时确保退化时可快速失败。
- imagery 阈值继续沿用 zoom 回归基线，作为与 tile-load/tile-parse 并列的多 stage 恢复门禁。

## 基线漂移门禁（v1.5）

- 命令：`npm run test:metrics:baseline`
- 脚本：`scripts/assert-map-engine-metrics-baseline.mjs`
- 配置：`scripts/map-engine-metrics-baseline.config.json`（可被 `MAP_ENGINE_METRICS_BASELINE_CONFIG` 覆盖）
- CI 平台配置：`scripts/map-engine-metrics-baseline.linux.json`、`scripts/map-engine-metrics-baseline.macos.json`
- diff 报告：`test-results/map-engine-metrics-baseline-diff.json`
- 门禁口径：
  - zoom 关键指标（`averageFPS`、`frameDrops`、`imageryRequested`、`imageryCancelRatio`）采用区间断言
  - deterministic tile keys（`beforeTiles`/`afterTiles`）采用精确匹配
  - stage recovery 指标（tile-load/tile-parse query/hit/rule-hit）采用区间断言
  - surface coordTransform 指标（固定 tile key、position 差异、uv 不变性）采用等值或区间断言
  - surface lifecycle 指标（remove 清理、globe 可见性恢复、re-add tile key 一致性）采用等值或区间断言
  - surface lifecycle stress 指标（多轮生命周期恢复计数、scene object 稳定性）采用等值或区间断言
  - Terrarium decode 指标（worker-hit/fallback request/hit/rate）采用区间断言
  - Vector pick 指标（center hit 类型/要素身份、miss 非 vector-feature）采用等值或区间断言
  - Vector geometry pick 指标（point/line/polygon 三类命中身份 + miss 非 vector-feature）采用等值或区间断言
  - Vector multi-tile pick 指标（跨 tile 左/右命中身份、边界邻近命中、miss 非 vector-feature）采用等值或区间断言
  - Vector overlap pick 指标（zIndex 优先命中、近深度命中、miss 非 vector-feature）采用等值或区间断言
  - Vector layer-zindex pick 指标（跨图层 zIndex 命中、高层隐藏后回退命中、miss 非 vector-feature）采用等值或区间断言
  - Basic Globe performance 指标（before/after tile key、FPS、frame drops、tile 请求与取消、render/layer 计数）采用等值或区间断言
  - Basic Globe load-recovery 指标（heavy 后 overlay 清退、layer/scene object 恢复、FPS 比率）采用等值或区间断言
  - Basic Globe load-recovery-stress 指标（多轮 heavy/recovery 恢复计数、scene object 稳定性、FPS 比率 min/max）采用等值或区间断言
  - Basic Globe load-recovery-endurance 指标（长时 heavy/recovery 交互步数、恢复计数、tile 稳定性、FPS 比率）采用等值或区间断言
  - Basic Globe load-recovery-drift 指标（多轮 heavy/recovery 的恢复计数、tile 稳定性与 FPS 比率漂移约束）采用等值或区间断言
- CI 集成：该门禁已串入 `test:map-engine`，在 GitHub Actions 默认执行

## VectorTile 回归门禁（v2.0）

- 采样页面：`examples/vector-tile-regression.ts`
- 指标文件：`test-results/vector-tile-regression-metrics.json`
- feature counts（point/line/polygon）：`1 / 1 / 1`
- rendered object count：`>= 3`
- 用途：为 VectorTile MVP 提供 browser 级回归证据，防止“仅单测通过但浏览器渲染退化”

## Projection 回归门禁（v2.1）

- 采样页面：`examples/projection-regression.ts`
- 指标文件：`test-results/projection-regression-metrics.json`
- round-trip 阈值（米）：
  - WGS84 -> GCJ02 -> WGS84：`<= 2.5`
  - GCJ02 -> BD09 -> GCJ02：`<= 0.3`
  - WGS84 -> BD09 -> WGS84：`<= 2.5`
- 用途：为坐标转换精度提供浏览器门禁，避免投影链路退化

## Terrarium Decode Worker 可观测性门禁（v2.2）

- 采样页面：`examples/terrarium-decode-regression.ts`
- 指标文件：`test-results/terrarium-decode-regression-metrics.json`
- worker path：`workerRequestCount=2`、`workerHitCount=2`、`workerFallbackCount=0`、`workerHitRate=1`
- fallback path：`fallbackRequestCount=2`、`fallbackHitCount=0`、`fallbackCount=2`、`fallbackHitRate=0`
- decode signature：worker/fallback 都为 `896.00,191.00`
- 用途：把 Terrarium 解码链路从“是否能解码”提升为“worker 命中与主线程回退均有量化证据”

## VectorTile Pick 精度门禁（v2.3）

- 采样页面：`examples/vector-pick-regression.ts`
- 指标文件：`test-results/vector-pick-regression-metrics.json`
- center pick：`centerHitType=vector-feature`、`centerFeatureLayer=places`、`centerFeatureType=point`、`centerFeatureKind=center-point`、`centerHitIsExpected=1`
- miss pick：`missHitType=none`、`missHitIsVectorFeature=0`
- 用途：给 VectorTile 交互链路提供浏览器证据，避免“渲染可见但拾取退化”漏检

## VectorTile 线面 Pick 精度门禁（v2.4）

- 采样页面：`examples/vector-geometry-pick-regression.ts`
- 指标文件：`test-results/vector-geometry-pick-regression-metrics.json`
- point pick：`pointHitType=vector-feature`、`pointHitLayer=places`、`pointHitKind=point-target`
- line pick：`lineHitType=vector-feature`、`lineHitLayer=roads`、`lineHitKind=line-target`
- polygon pick：`polygonHitType=vector-feature`、`polygonHitLayer=landuse`、`polygonHitKind=polygon-target`
- 命中汇总：`allHitsExpected=1`
- miss guard：`missHitIsVectorFeature=0`
- 用途：把 VectorTile 点/线/面交互命中纳入 deterministic 门禁，防止仅点命中稳定而线面命中退化

## VectorTile 多 tile 边界 Pick 门禁（v2.5）

- 采样页面：`examples/vector-multi-tile-pick-regression.ts`
- 指标文件：`test-results/vector-multi-tile-pick-regression-metrics.json`
- 左右命中：`leftPointHitKind=left-point-target`、`rightPointHitKind=right-point-target`
- 边界邻近命中：`seamLeftHitLayer=places-left` + `seamLeftHitKind=left-seam-point-target`、`seamRightHitLayer=places-right` + `seamRightHitKind=right-seam-point-target`
- 命中汇总：`allHitsExpected=1`、`tileBucketCount=2`
- miss guard：`missHitIsVectorFeature=0`
- 用途：把跨 tile 边界邻近区域的交互命中纳入 deterministic 门禁，防止多 tile 场景下 pick 偏移或命中串桶

## VectorTile 重叠要素 Pick 优先级门禁（v2.6）

- 采样页面：`examples/vector-overlap-pick-regression.ts`
- 指标文件：`test-results/vector-overlap-pick-regression-metrics.json`
- zIndex 优先命中：`zIndexHitLayer=places-high`、`zIndexHitKind=overlap-zindex-high-target`、`zIndexHitIsExpected=1`
- 近深度命中：`depthHitLayer=depth-near`、`depthHitKind=overlap-depth-near-target`、`depthHitIsExpected=1`
- 命中汇总：`allHitsExpected=1`
- miss guard：`missHitIsVectorFeature=0`
- 用途：把重叠要素的 pick 选择规则（`zIndex` 覆盖 + 近深度兜底）纳入 deterministic 门禁，防止交互命中顺序回归

## VectorTile 跨图层 zIndex Pick 门禁（v2.7）

- 采样页面：`examples/vector-layer-zindex-pick-regression.ts`
- 指标文件：`test-results/vector-layer-zindex-pick-regression-metrics.json`
- 高层命中：`topLayerHitLayer=places-high`、`topLayerHitKind=high-layer-target`
- 高层隐藏后回退命中：`hiddenFallbackHitLayer=places-low`、`hiddenFallbackHitKind=low-layer-target`
- 命中汇总：`allHitsExpected=1`
- miss guard：`missHitIsVectorFeature=0`
- 用途：把跨图层 zIndex pick 顺序纳入 deterministic 门禁，防止图层排序或可见性切换导致命中回归

## SurfaceTile 坐标转换几何一致性门禁（v2.8）

- 采样页面：`examples/surface-tile-coord-transform-regression.ts`
- 指标文件：`test-results/surface-tile-coord-transform-regression-metrics.json`
- 固定 tile key：`noTransformTileKeys=2/2/1`、`transformTileKeys=2/2/1`、`tileKeyMatch=1`
- 几何差异：`positionDeltaMax=0.002620604820549549`、`transformApplied=1`
- UV 一致性：`uvDeltaMax=0`、`uvInvariant=1`
- 汇总：`allExpected=1`
- 用途：把 `coordTransform` 从“参数已传递”提升到“浏览器几何结果可验证”，防止后续重构导致转换失效或破坏 UV

## Basic Globe 性能回归门禁（v2.9）

- 采样页面：`examples/basic-globe-performance-regression.ts`
- 指标文件：`test-results/basic-globe-performance-regression-metrics.json`
- deterministic tile key：`beforeTiles=2/2/1,2/3/1`、`afterTiles=4/8/4,4/8/5,4/9/4,4/9/5`
- 性能与请求：`averageFPS=214.21`、`frameDrops=3`、`imageryRequested=18`、`imageryCancelled=11`、`elevationRequested=7`、`imageryCancelRatio=0.6111`
- 场景复杂度：`renderCount=69`、`layerCount=4`、`markerCount=4`、`polylineCount=2`、`polygonCount=1`
- 用途：把 A4 的 `basic-globe` 手动性能验收升级为 deterministic browser gate，持续追踪 pan/zoom 下渲染与请求稳定性

## SurfaceTile 生命周期门禁（v3.0）

- 采样页面：`examples/surface-tile-lifecycle-regression.ts`
- 指标文件：`test-results/surface-tile-lifecycle-regression-metrics.json`
- 首次加载：`beforeTileKeys=2/2/1,2/3/1`、`beforeTileCount=2`
- remove 后：`afterRemoveTileCount=0`、`afterRemoveGroupPresent=0`、`afterRemoveGlobeVisible=1`
- re-add 后：`afterReAddTileKeys=2/2/1,2/3/1`、`afterReAddTileCount=2`、`tileKeysRestored=1`
- 汇总：`removeCleared=1`、`allExpected=1`
- 用途：把 SurfaceTile 生命周期（add/remove/re-add）从单测提升为 browser 级门禁，防止瓦片残留、场景对象泄漏或重建后状态错乱

## SurfaceTile 生命周期压力门禁（v3.1）

- 采样页面：`examples/surface-tile-lifecycle-stress-regression.ts`
- 指标文件：`test-results/surface-tile-lifecycle-stress-regression-metrics.json`
- 压力轮次：`cycleCount=3`
- 生命周期恢复计数：`tileKeysRestoredCount=3`、`removeClearedCount=3`
- scene object 稳定性：`sceneObjectCountMin=6`、`sceneObjectCountMax=6`、`stableSceneObjectCount=1`
- 汇总：`allExpected=1`
- 用途：将 SurfaceTile 生命周期从“单轮正确”提升到“多轮切换稳定”，防止循环操作下的对象残留或状态漂移

## Basic Globe 双画像负载门禁（v3.2）

- 采样页面：`examples/basic-globe-load-profile-regression.ts`
- 指标文件：`test-results/basic-globe-load-profile-regression-metrics.json`
- baseline 画像（SurfaceTile only）：`baselineAverageFPS=244.06`、`baselineFrameDrops=2`、`baselineImageryRequested=4`、`baselineRenderCount=48`、`baselineLayerCount=1`、`baselineSceneObjectCount=6`
- stress 画像（叠加 marker/polyline/polygon + 重视角巡航）：`stressAverageFPS=576.34`、`stressFrameDrops=2`、`stressImageryRequested=10`、`stressRenderCount=240`、`stressLayerCount=4`、`stressSceneObjectCount=9`
- 派生指标：`fpsRatio=0.4235`（归一化 `min(fps)/max(fps)`）、`frameDropsDelta=0`、`imageryRequestedDelta=6`、`sceneObjectDelta=3`
- 汇总：`allExpected=1`
- 用途：把“headless 环境绝对 FPS 数值不稳定”转成“同一回归内的双画像对照证据”，持续追踪负载画像变化并降低误判

## Basic Globe 负载阶梯门禁（v3.3）

- 采样页面：`examples/basic-globe-load-ladder-regression.ts`
- 指标文件：`test-results/basic-globe-load-ladder-regression-metrics.json`
- baseline：`baselineAverageFPS=147.38`、`baselineFrameDrops=2`、`baselineImageryRequested=4`、`baselineRenderCount=29`、`baselineLayerCount=1`、`baselineSceneObjectCount=6`
- medium：`mediumAverageFPS=576.34`、`mediumFrameDrops=4`、`mediumImageryRequested=4`、`mediumRenderCount=75`、`mediumLayerCount=3`、`mediumSceneObjectCount=8`
- heavy：`heavyAverageFPS=133.33`、`heavyFrameDrops=4`、`heavyImageryRequested=4`、`heavyRenderCount=87`、`heavyLayerCount=4`、`heavySceneObjectCount=9`
- 阶梯指标：`mediumBaselineFpsRatio=0.2557`、`heavyBaselineFpsRatio=0.9047`、`mediumImageryRequestedDelta=0`、`heavyImageryRequestedDelta=0`
- 单调性：`sceneObjectMonotonic=1`、`layerMonotonic=1`
- 负载规模：`markerCount=12`、`polylineCount=6`、`polygonCount=3`
- 汇总：`allExpected=1`
- 用途：将“负载升高后是否保持结构关系稳定”纳入自动门禁，以 scene/layer 单调与 FPS 比率区间约束替代绝对 FPS 假设

## Basic Globe 负载恢复门禁（v3.4）

- 采样页面：`examples/basic-globe-load-recovery-regression.ts`
- 指标文件：`test-results/basic-globe-load-recovery-regression-metrics.json`
- baseline：`baselineAverageFPS=108.14`、`baselineFrameDrops=4`、`baselineImageryRequested=4`、`baselineRenderCount=31`、`baselineLayerCount=1`、`baselineSceneObjectCount=6`
- heavy：`heavyAverageFPS=171.48`、`heavyFrameDrops=3`、`heavyImageryRequested=10`、`heavyRenderCount=169`、`heavyLayerCount=4`、`heavySceneObjectCount=9`
- recovery：`recoveryAverageFPS=117.39`、`recoveryFrameDrops=3`、`recoveryImageryRequested=0`、`recoveryRenderCount=36`、`recoveryLayerCount=1`、`recoverySceneObjectCount=6`
- 恢复指标：`heavyBaselineFpsRatio=0.6306`、`recoveryBaselineFpsRatio=0.9212`、`recoveryHeavyFpsRatio=0.6846`、`layerRecovered=1`、`sceneObjectRecovered=1`
- 负载规模：`markerCount=12`、`polylineCount=6`、`polygonCount=3`
- 汇总：`allExpected=1`
- 用途：将“业务高负载后恢复到常态”纳入自动门禁，防止 overlay 清退后出现 layer 残留或 scene object 泄漏

## Basic Globe 负载恢复压力门禁（v3.5）

- 采样页面：`examples/basic-globe-load-recovery-stress-regression.ts`
- 指标文件：`test-results/basic-globe-load-recovery-stress-regression-metrics.json`
- baseline：`baselineAverageFPS=108.79`、`baselineFrameDrops=3`、`baselineImageryRequested=4`、`baselineRenderCount=29`、`baselineLayerCount=1`、`baselineSceneObjectCount=6`
- heavy（3 轮聚合）：`heavyAverageFpsMin/Max=90.02/181.76`、`heavyFrameDropsMax=5`、`heavyImageryRequestedTotal=10`、`heavyRenderCountMax=172`、`heavyLayerCountMax=4`、`heavySceneObjectCountMax=9`
- recovery（3 轮聚合）：`recoveryAverageFpsMin/Max=48.9/101.09`、`recoveryFrameDropsMax=5`、`recoveryImageryRequestedTotal=0`、`recoveryRenderCountMax=32`、`recoveryLayerCountMin=1`、`recoverySceneObjectCountMin/Max=6/6`
- 比率与恢复：`heavyBaselineFpsRatioMin/Max=0.5985/0.8275`、`recoveryBaselineFpsRatioMin/Max=0.4495/0.9292`、`recoveryHeavyFpsRatioMin/Max=0.3617/0.6571`、`layerRecoveredCount=3`、`sceneObjectRecoveredCount=3`、`stableRecoverySceneObjectCount=1`
- 负载规模：`markerCount=12`、`polylineCount=6`、`polygonCount=3`
- 汇总：`allExpected=1`
- 用途：将“多轮业务负载波动后是否稳定恢复”纳入自动门禁，防止重复清退路径上的 layer 残留与 scene object 漂移

## Basic Globe 负载恢复耐久门禁（v3.6）

- 采样页面：`examples/basic-globe-load-recovery-endurance-regression.ts`
- 指标文件：`test-results/basic-globe-load-recovery-endurance-regression-metrics.json`
- 性能比率（min）：`baselineAverageFPS=167.79`、`heavyAverageFpsMin=193.48`、`recoveryAverageFpsMin=88.23`、`heavyBaselineFpsRatioMin=0.2797`、`recoveryBaselineFpsRatioMin=0.5034`、`recoveryHeavyFpsRatioMin=0.397`
- 结构恢复：`cycleCount=5`、`layerRecoveredCount=5`、`sceneObjectRecoveredCount=5`、`renderRecoveredCount=5`（门禁区间 `4~5`）、`stableRecoverySceneObjectCount=1`、`recoveryTileStableCount=1`
- 交互压力：`heavyInteractionStepCountTotal=25`、`recoveryInteractionStepCountTotal=20`、`heavyImageryRequestedTotal=10`、`recoveryImageryRequestedTotal=0`
- 负载规模：`markerCount=12`、`polylineCount=6`、`polygonCount=3`
- 汇总：`allExpected=1`
- 用途：将“长时业务交互压力下多轮恢复是否持续稳定”纳入自动门禁，防止交互轮次增长后出现恢复漂移与 tile 状态抖动

## Basic Globe 负载恢复漂移门禁（v3.7）

- 采样页面：`examples/basic-globe-load-recovery-drift-regression.ts`
- 指标文件：`test-results/basic-globe-load-recovery-drift-regression-metrics.json`
- 性能比率（min）：`baselineAverageFPS=188.13`、`heavyAverageFpsMin=206.82`、`recoveryAverageFpsMin=157.89`、`heavyBaselineFpsRatioMin=0.3136`、`recoveryBaselineFpsRatioMin=0.6268`、`recoveryHeavyFpsRatioMin=0.2632`
- 结构恢复：`cycleCount=5`、`layerRecoveredCount=5`、`sceneObjectRecoveredCount=5`、`renderRecoveredCount=5`、`stableRecoverySceneObjectCount=1`、`recoveryTileStableCount=1`
- 交互压力：`heavyInteractionStepCountTotal=25`、`recoveryInteractionStepCountTotal=20`、`heavyImageryRequestedTotal=10`、`recoveryImageryRequestedTotal=0`
- 负载规模：`markerCount=12`、`polylineCount=6`、`polygonCount=3`
- 汇总：`allExpected=1`
- 用途：将“多轮 heavy/recovery 交互下恢复指标是否出现可观测漂移”纳入自动门禁，防止恢复链路在长时运行后出现隐性退化

## 倾斜摄影回归门禁（v3.8）

- 采样页面：`examples/oblique-photogrammetry-regression.ts`
- 指标文件：`test-results/oblique-photogrammetry-regression-metrics.json`
- tileset 与可见性：`tilesetNodeCount=4`、`sequenceStepCount=9`（3 轮）、`baseline/near/recoveryVisibleNodeCount=1/3/1`
- 漂移约束：`driftCycleCount=3`、`recoveryStableCount=3`、`nearPickHitCount=3`、`visibilityDriftMax=0`
- LOD 代理：`visibleNodeCountMin/Max=1/3`、`maxVisibleDepth=1`
- 拾取链路：`pickHitType=oblique-photogrammetry-node`、`pickHitNodeId=child-center`
- 性能与稳定性：`averageFPS=15.95`、`frameDrops=9`、`allExpected=1`
- 用途：将倾斜摄影首期能力（tileset 接入、视角驱动可见性、拾取命中）纳入 deterministic browser + baseline 自动门禁

## 解读

- 缩放场景已稳定触发 SurfaceTile 选中集合变化，可作为第三个 deterministic 回归门禁。
- 瓦片取消链路已生效：中间缩放阶段的过期 imagery 请求被取消，没有继续污染最终 tile 集合。
- 恢复策略指标已经接入基线输出；当前场景未配置显式恢复规则，因此 `hit/rule-hit = 0` 属于预期。
- 主线程阻塞代理指标目前以 `frame drops` 表示；当前 smoke 记录为 `3`，可作为后续优化的对照基线。
- 双画像负载门禁使用归一化 `fpsRatio` 与对象/请求增量来约束“画像变化幅度”，避免直接把 headless 绝对 FPS 当成真实业务性能承诺。
- Basic Globe 回归场景已对 `averageFPS` 做 `<=1200` 裁剪，降低 headless 极端帧率抖动导致的比率失真与误报。
- 负载阶梯门禁进一步把 baseline/medium/heavy 的结构关系（layer 与 scene object 单调）固化为约束，降低“仅看单点指标”导致的误判风险。
- 负载恢复门禁把“重负载->清退”路径纳入 deterministic 证据，验证恢复后 layer 与 scene object 回落到 baseline 级别。
- 负载恢复压力门禁把“多轮 heavy/recovery”路径纳入 deterministic 证据，验证循环操作下恢复计数与 scene object 一致性。
- 负载恢复耐久门禁把“长时 heavy/recovery 交互压力”路径纳入 deterministic 证据，验证 5 轮交互后恢复计数、tile 稳定性与 render 回落一致。
- 负载恢复漂移门禁在耐久路径上额外固化恢复一致性约束，允许少量 headless 抖动但要求跨轮恢复统计持续收敛。
- 倾斜摄影门禁已接入 `test:map-engine`，当前可稳定输出可见节点计数、LOD 深度代理与拾取命中结果。
- Basic Globe render-count 基线区间已按 headless 高帧率特性放宽，重点由绝对帧计数转向结构关系与恢复计数证据。
- `latest frame time` 取自采样末帧，headless 场景下可能出现 `0ms`，应与 `average FPS`、`frame drops` 联合解读。

## 已知约束

- `rspack build` 仍有 bundle size warning，当前 `three.js` chunk 超过推荐阈值；这与 requirement 中的包体积 Q3 一致，暂不作为本阶段阻塞项。
- 基线运行在 headless Chrome smoke 环境，数值适合作为回归对照，不等同于真实业务负载下的最终性能承诺。
