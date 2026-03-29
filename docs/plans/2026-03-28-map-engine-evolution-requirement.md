# 标准模式需求文档

## 0) 元信息（必填）

- 需求标题：Three-Map 根据现有 docs 的阶段化演进需求
- 需求模式：`标准`
- 需求来源：`docs/architecture/executive-summary.md`、`docs/architecture/architecture-evolution-plan.md`、`docs/architecture/long-term-development-roadmap.md`、`docs/plans/2026-03-28-three-map-enhancement.md`
- 负责人：three-map 维护者
- 更新时间：2026-03-29

## 1) 需求摘要（必填）

- 背景与目标：当前仓库已具备地球渲染、SurfaceTileLayer、高程、基础空间/投影与若干图层能力，但文档目标已经推进到“高性能、可扩展、企业级地图引擎”，而当前实现仍停留在 `v0.1.0`，且 `VectorTileLayer` 仍是占位实现。需求目标是在不做大规模推倒重写的前提下，把文档中的演进方向收敛成未来 2 个版本可执行的工程路线：先稳固核心渲染/瓦片链路和质量门禁，再补齐矢量瓦片与投影扩展，并将倾斜摄影（Oblique Photogrammetry）纳入下一阶段可执行需求，最后为插件化和更长期目标预留接口。
- 用户价值：让引擎维护者和后续协作者可以基于同一条路线演进地图引擎，降低“文档愿景很大、代码落点很散”的风险，同时确保每一步演进都能通过自动化与浏览器证据验证。
- 成功指标（可量化，至少 1 条）：1) 每次核心改动均可通过 `npm run typecheck`、`npm run test:run`、`npm run test:browser:surface-tiles`；2) `VectorTileLayer` 不再返回空占位结果，至少完成 point/line/polygon 三类 MVT 基础解析并具备自动化测试；3) 瓦片渲染链路新增至少 3 个确定性浏览器回归场景，覆盖 selection 切换、viewport resize、相机缩放或平移中的 1 种；4) 首个阶段结束前形成明确的性能基线文档，包含帧率、内存、请求浪费或主线程阻塞的代理指标；5) 倾斜摄影首期能力至少具备 1 个可加载 tileset（本地或测试源）+ 1 个 deterministic 浏览器回归场景，并输出可追溯 metrics JSON。
- 截止时间：2026-06-05
- 非目标（本次明确不做）：不在本阶段实现离线存储、AR/VR、插件市场、商业化 SaaS、云原生分布式架构，也不进行“全部模块一次性重写”的大爆炸式重构；不在首期倾斜摄影阶段实现城市级海量数据生产流水线（OSGB 全量转换、在线编辑、资产管理平台）。

## 2) 范围、依赖与约束（必填）

- In-scope：核心接口与模块边界梳理；瓦片调度/取消/回收与渲染稳定性增强；DEM/瓦片解码 worker 化；性能监控与浏览器回归门禁；`VectorTileLayer` MVP；投影与坐标转换链路补强；倾斜摄影首期能力（tileset 接入、可见性裁剪、拾取链路与回归门禁）；相关 docs 与 demo 对齐。
- Out-of-scope：离线瓦片缓存体系、WebXR、分布式渲染、插件市场、企业权限与 SaaS 服务、全球化部署、OSGB 全流程生产化转换与资产管理平台。
- 上游依赖：维护者确认首个交付里程碑；允许引入 MVT 解析依赖；确定 CI 执行环境是否可运行 headless Chrome；确认包体积目标在 v0.x 的强约束还是中期目标；确认倾斜摄影首期数据格式（3D Tiles / I3S / OSGB 离线转换）与测试数据版权。
- 下游影响：`src/engine`、`src/layers`、`src/tiles`、`src/projection`、`src/spatial`、`src/io`（新增 tileset 适配器时）、`examples/`、测试与浏览器 smoke 脚本、架构与路线图文档。
- 约束（性能/兼容/安全/时间/成本）：技术栈保持 `TypeScript + Three.js + Rspack`；保持当前公开 API 和 demos 基本兼容；浏览器环境受并发请求数限制；长期文档要求包体积 `< 300KB gzipped`，但当前 `three.js` chunk 已超过该预算，因此只能分阶段逼近，不能作为首阶段唯一门禁；视觉正确性必须以浏览器证据验证，不能只看数据结构；倾斜摄影首期默认只纳入单 tileset demo 规模，不承诺城市级并发加载能力。
- 前置假设（Assumptions）：继续采用模块化单体架构；首阶段优先解决“渲染正确性 + 工程可验证性”；现有公开瓦片源仍仅用于 demo 和开发验证，不作为生产 SLA 方案；倾斜摄影首期优先采用 3D Tiles 规范作为接入目标。

## 3) 待确认问题（必填，逐条状态）

| ID | 问题 | 状态 | Owner | 截止时间 | 风险 |
| --- | --- | --- | --- | --- | --- |
| Q1 | 首个正式交付里程碑是否以 `v0.2/v0.3` 的“核心稳固 + 性能门禁”作为目标，而不是直接瞄准 `v1.0` 功能全集 | `待确认` | three-map 维护者 | 2026-03-31 | 高 |
| Q2 | 是否允许为 `VectorTileLayer` 引入 `pbf` / `@mapbox/vector-tile` 或等价依赖来完成 MVT MVP | `待确认` | three-map 维护者 | 2026-04-02 | 高 |
| Q3 | 文档中的 `< 300KB gzipped` 是否作为 `v0.x` 强约束执行，还是推迟到核心能力稳定后再优化 | `有风险假设` | 架构负责人 | 2026-04-02 | 中 |
| Q4 | 后续 CI 是否以 GitHub Actions + headless Chrome 作为浏览器 smoke 的默认执行环境 | `有风险假设` | three-map 维护者 | 2026-04-01 | 中 |
| Q5 | 是否确认采用“渐进式演进、保持现有 API 基本兼容、不做全量重写”的工程策略 | `已确认` | 架构文档 | 2026-03-28 | 低 |
| Q6 | 倾斜摄影首期格式是否确定为 `3D Tiles (tileset.json + b3dm/i3dm)`，OSGB/I3S 通过离线转换接入而非引擎内置直读 | `已确认` | 架构负责人 | 2026-03-29 | 高 |
| Q7 | 倾斜摄影测试数据集的版权、体量上限与仓库存放策略（repo fixture / 远程下载）是否确定 | `已确认` | three-map 维护者 | 2026-03-29 | 中 |

## 4) 方案对比（A/B，必要时 C）

| 维度 | 方案 A | 方案 B | 方案 C（可选） |
| --- | --- | --- | --- |
| 实现复杂度 | 中：先核心稳固、再性能/测试、再补齐 MVT 与投影 | 中高：优先补齐 docs 中缺失功能，架构治理后置 | 高：先做接口/状态/插件化大重构，再迁移现有能力 |
| 交付速度 | 中快：4-10 周可持续交付多个小版本 | 快：早期可快速展示功能，但后续返工概率高 | 慢：短期难以产出稳定可用版本 |
| 风险等级 | 中：风险可分阶段隔离，回滚边界清晰 | 高：功能先行会放大当前渲染/调度债务 | 高：重构面过大，容易中断现有引擎可用性 |
| 回滚成本 | 中：可按任务/模块回退，浏览器 smoke 可辅助判定 | 中高：功能与底层耦合，回退容易带出兼容问题 | 高：接口重构一旦铺开，回滚代价大 |
| 可维护性 | 高：先补门禁和模块边界，再扩功能 | 中：功能可见度高，但技术债易积累 | 中高：长期理想，但短期维护成本最高 |

- 推荐方案：方案 A
- 推荐理由（不超过 5 条）：1) 与现有 docs 的“阶段一核心稳固 → 阶段二功能完整”节奏一致；2) 能利用已存在的单测、浏览器 smoke 和 deterministic demos 建立真实门禁；3) 避免在 `VectorTileLayer` 仍为空实现时继续扩大能力表面；4) 允许维护者按版本逐步冻结 API 与性能预算；5) 更适合当前 `v0.1.0` 的工程成熟度。
- 不选其他方案的关键原因：方案 B 会在当前瓦片调度、渲染回归和工程门禁尚未稳固时继续叠加功能风险；方案 C 虽然长期更整洁，但与当前代码规模和团队上下文不匹配，短期极易造成“架构升级中断功能演进”。

## 5) 任务拆分（必填）

| 任务ID | 任务描述 | 优先级 | 预计工时 | Owner | 依赖任务 | 阻塞条件 | 影响文件/模块 | 验收命令 | 风险等级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 冻结 `v0.2/v0.3` 的首阶段边界，建立核心接口/模块边界与错误处理接缝，明确哪些能力保留兼容、哪些以实验特性推进 | `P0` | `M` | 架构负责人 | 无 | Q1 未确认 | `src/engine`、`src/layers`、`src/index.ts`、架构 docs | `npm run test:run -- tests/engine/GlobeEngine.test.ts tests/layers/LayerManager.test.ts` | 中 |
| T2 | 补齐瓦片链路稳定性：TileScheduler 优先级/取消、AbortController、必要的 TTL/淘汰策略，并保持 `SurfaceTileLayer` 生命周期正确 | `P0` | `L` | 渲染负责人 | T1 | Q1 未确认 | `src/layers/SurfaceTileLayer.ts`、`src/tiles/*`、相关 tests | `npm run test:run -- tests/layers/SurfaceTileLayer.test.ts tests/tiles/TileScheduler.test.ts tests/tiles/TileCache.test.ts && npm run test:browser:surface-tiles` | 高 |
| T3 | 将 DEM/瓦片解码与高开销路径逐步 worker 化，并建立性能/调度基线输出，覆盖主线程阻塞和无效请求浪费 | `P1` | `L` | 性能负责人 | T2 | 性能基线口径未冻结 | `src/workers`、`src/tiles/TerrariumDecoder.ts`、`src/core/PerformanceMonitor.ts`、性能 docs | `npm run test:run -- tests/tiles/TerrariumDecoder.test.ts tests/engine/RenderScheduling.test.ts tests/core/PerformanceMonitor.test.ts` | 高 |
| T4 | 完成 `VectorTileLayer` MVP：支持 MVT point/line/polygon 基础解析、样式映射与 GlobeEngine 接入，默认保持实验性 | `P1` | `L` | 数据图层负责人 | T1 | Q2 未确认 | `src/layers/VectorTileLayer.ts`、新增 MVT 解码模块、相关 tests/examples | `npm run test:run -- tests/layers/VectorTileLayer.test.ts` | 高 |
| T5 | 补强投影与坐标系统：统一投影抽象、维持 GCJ-02/BD-09/WGS84 能力并对 Surface/Vector 链路提供一致坐标语义 | `P1` | `M` | 地理算法负责人 | T1 | Q3 未确认 | `src/projection/*`、`src/spatial/CoordinateTransform.ts`、示例与 tests | `npm run test:run -- tests/projection/Projection.test.ts tests/spatial/CoordinateTransform.test.ts tests/examples/tile-sources-gaode-baidu.test.ts` | 中 |
| T6 | 建立演进门禁：把 typecheck、全量测试、浏览器 smoke、deterministic demos、文档更新接成统一质量入口，优先对接 CI | `P0` | `M` | 质量负责人 | T2,T3,T4,T5 | Q4 未确认 | `package.json`、`scripts/`、`examples/`、`tests/`、CI 配置 | `bash "$HOME/.codex/skills/map-engine-testing/scripts/run-map-engine-checks.sh"` | 中 |
| T7 | 倾斜摄影首期能力落地：新增 `ObliquePhotogrammetryLayer`（或等价层）与 3D Tiles tileset 读取适配，支持基础可见性裁剪、拾取与 deterministic 回归门禁 | `P1` | `L` | 渲染负责人 | T1,T6 | 无 | `src/layers/*`、`src/tiles/*`、`src/io/*`、`examples/*`、`scripts/*`、相关 tests/docs | `npm run test:run -- tests/layers/ObliquePhotogrammetryLayer.test.ts && npm run test:browser:surface-tiles && npm run test:metrics:baseline` | 高 |

## 6) 验收用例矩阵（必填，测试化）

| 用例ID | 类型 | Given | When | Then | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| A1 | `回归` | 已加载 deterministic `surface-tile-regression` 页面 | 在不移动相机的情况下切换选中瓦片 | 页面状态进入 `after-switch`，active tile key 更新为新瓦片，浏览器 smoke 通过 | `自动` |
| A2 | `回归` | 已加载 deterministic `surface-tile-resize-regression` 页面 | 调整 viewport 尺寸并触发 `engine.resize()` | 默认 selector 重算 active tiles，`beforeTiles` 与 `afterTiles` 不相同 | `自动` |
| A3 | `功能` | 存在合法的 MVT point/line/polygon 测试夹具 | `VectorTileLayer` 加载并解析一组矢量瓦片 | 三类要素均可转换为引擎可渲染几何，测试不再只验证空占位行为 | `自动` |
| A4 | `性能` | 已加载 deterministic `basic-globe-performance-regression` 页面 | 执行固定 pan/zoom 视角序列并采集性能与请求指标 | 输出 `before/after` tile key、FPS、frame drops、请求取消率和场景复杂度指标，浏览器 smoke + baseline 通过 | `自动` |
| A5 | `回归` | 已加载 deterministic `surface-tile-coord-transform-regression` 页面 | 对比 no-transform / with-transform 两层 SurfaceTile 的几何与 UV 输出 | `tileKeyMatch=1`、`transformApplied=1`、`uvInvariant=1` 且 smoke + baseline 通过，坐标转换链路保持几何生效与影像贴图一致性 | `自动` |
| A6 | `发布` | 当前分支已合入核心演进任务 | 运行统一质量入口 | `typecheck`、全量测试、浏览器 smoke 全绿，且 deterministic demos 可生成证据 | `自动` |
| A7 | `功能` | 已接入可复现的倾斜摄影测试 tileset（fixture 或稳定远程源） | 执行固定视角序列并触发缩放/平移/拾取 | 页面输出可见节点计数、SSE 或 LOD 代理指标、拾取命中结果，且 browser smoke + baseline 通过 | `自动` |

## 7) 发布与回滚（标准/发布级必填）

- Done 标准：首阶段（核心稳固 + 性能/测试门禁）完成后，`SurfaceTileLayer` 与 viewport/LOD 渲染链路具备稳定自动化与浏览器证据；`VectorTileLayer` 至少达到 MVP，不再是空实现；投影/坐标链路完成统一抽象；倾斜摄影需求与任务边界完成落盘并具备可执行验收口径；所有演进任务均有明确验收命令和文档更新。
- 上线门禁：`npm run typecheck`、`npm run test:run`、`npm run test:browser:surface-tiles` 全部通过；关键 deterministic demos 能稳定输出截图/DOM 快照；不存在未处置的 P0 风险；实验性功能（如 VectorTile MVP）需可通过配置或导出策略隔离。
- 回滚触发条件：核心渲染链路出现 deterministic smoke 失败；相机缩放/viewport 相关回归导致 active tiles 错乱；引入 MVT、worker 化或倾斜摄影链路后使现有 demos/测试持续失败；性能基线相对当前稳定版本下降超过 20% 且无短期修复方案。
- 回滚路径：按任务边界回退到上一阶段稳定版本；优先保留已验证的 `SurfaceTileLayer`/projection 基线；对实验特性通过禁用导出、关闭入口或回退新增模块处理；必要时只保留 T1/T2/T6 的工程门禁成果，推迟 T3/T4/T5/T7。
- 观测指标（D0 / D+1 / D+7）：D0 关注 typecheck/test/browser smoke 是否稳定、demo 崩溃与截图产物是否生成；D+1 关注瓦片错误率、无效请求/取消率、主线程长任务与回归 issue 数量；D+7 关注 VectorTile MVP 与倾斜摄影首期能力可用性、文档与实际实现的一致性、后续演进任务的返工比例。

## 8) 质量评分（必填）

- 评分卡文件：`references/requirement-quality-scorecard.md`
- 当前总分：88
- 是否可进入下一阶段：`是`
- 若否，补齐项（owner + 截止时间）：无

## 9) 倾斜摄影专项需求（新增）

- 目标能力边界：支持首期倾斜摄影 tileset 加载、视角驱动的可见性更新、基础拾取和回归门禁；不在首期承担生产级数据治理与编辑能力。
- 技术路径（建议）：优先 3D Tiles 规范（`tileset.json` + `b3dm/i3dm`），OSGB/I3S 通过离线转换进入统一 tileset 接口，避免引擎内多格式直读造成复杂度失控。
- 门禁口径：新增 deterministic `oblique-photogrammetry-regression`（命名待最终确定），输出 `visibleNodeCount`、`lodLevel`（或 SSE 代理）、`pickHitType`、`frameDrops`、`allExpected` 等指标，并进入 smoke + baseline。
- 迭代里程碑：`v3.8` 已完成需求落盘与接口草案；`v3.9` 已完成 demo + smoke + baseline + CI 门禁串联；`v4.0` 已完成真实数据集治理（manifest/schema/download/validate）与 oblique 漂移门禁收口；`v4.1` 已完成下载链路负向门禁（不可达/checksum 失配/strict-remote 缺缓存）。
