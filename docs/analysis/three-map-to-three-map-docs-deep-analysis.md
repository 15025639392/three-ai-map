# 深度剖析报告：three-map -> three-map-docs

日期：2026-03-28
作者：ldy
源库版本：0.1.0（见 `package.json`）
目标版本/运行时：仓库内 Markdown 文档体系（`docs/` + `README.md`）

## 1. 执行摘要

- 整体嫁接可行性：高（现有文档资产齐全，但需要做一致性治理与“状态标注”）
- 完美嫁接判定：不通过（存在多处文档与代码不一致 + 当前测试未全绿）
- 推荐策略：适配器 + 局部重构（先建立清晰的 docs 入口/分层/状态约束，再逐步补齐 API 与概念文档）
- 3 个主要阻塞项：
  1. `README.md` 仍引用已删除的 `TiledImageryLayer`，并指向不存在的 `docs/api/`，对新读者是“直接误导”（证据：`README.md`；对照：`docs/plans/remove-tiled-imagery-layer.md`、`src/index.ts`）。
  2. `docs/acceptance/enhanced-map-engine.md` 声称 “v1.0.0 / 197 tests PASS / MVT 已完成”，但 `package.json` 仍为 `0.1.0`，`VectorTileLayer` 仍为占位实现，且本地 `npm run test:run` 有 3 个失败用例（证据：`docs/acceptance/enhanced-map-engine.md`、`package.json`、`src/layers/VectorTileLayer.ts`、`tests/layers/SurfaceTileLayer.test.ts`）。
  3. 文档分层边界不清：验收/规划/断点续跑混在 `docs/`，且多份 plan 带有 “For Claude” 执行指令，使读者难判断哪些是“已实现事实”（证据：`docs/plans/2026-03-28-three-map-enhancement.md`、`docs/plans/2026-03-27-threejs-globe-engine.md`）。
- 3 个快速收益点：
  1. 立即修复 `README.md`：将示例与导出列表从 `TiledImageryLayer` 迁移到 `SurfaceTileLayer`；移除/补齐 `docs/api/` 引用（证据：`src/index.ts`）。
  2. 增加 `docs/index.md` + `docs/status.md`：明确“当前实现 / 已知缺口 / 下一步计划”与指向对应源码、测试与 open issues（证据：现 `docs/` 无入口文件）。
  3. 先把验证门禁对齐：修复 `SurfaceTileLayer` 当前 3 个失败测试，再将“通过数量”从文档里移出或自动生成（证据：`npm run test:run` 输出 + `src/layers/SurfaceTileLayer.ts`）。

## 2. 范围与假设

### 分析范围

- 文档资产：`README.md`、`docs/acceptance/*`、`docs/architecture/*`、`docs/plans/*`、`docs/checkpoints/*`、`docs/tile-rendering-open-issues.md`
- 对照验证：以“当前导出 API + 核心瓦片链路 + 测试/构建结果”为准，评估文档可信度与缺口

### 范围外

- 不在本报告内实现 MVT 解码（`VectorTileLayer` 的真实 MVT 解析）
- 不做 WebGL 性能基准与真实设备 FPS 评测（只记录当前 build/拆包与现有监控模块）
- 不做完整产品路线评审（只对 `docs/architecture/*` 的“现状一致性”给出结论）

### 约束条件

- 性能：文档中的性能数字必须可复现（命令、输入、环境）；否则应标注为“目标/愿景”而非“已达成”
- 兼容性：目标运行时为浏览器（Rspack 构建），文档需覆盖 CORS/跨域/Worker 限制等现实约束
- 安全/合规：第三方瓦片源（OSM/高德/百度）存在 CORS/服务条款风险，文档需明确风险与替代方案
- 许可证：当前仓库为 Private（见 `README.md` 许可段落），对外发布文档/代码需先明确许可证

## 3. 能力清单

| 能力 | 对外 API | 核心模块 | 扩展点 | 覆盖状态 |
| --- | --- | --- | --- | --- |
| 开发与运行 | `npm run dev/build/test:run/typecheck` | `package.json`、`rspack.config.ts` | 追加 demo/entry | 已覆盖（但 README 示例过时） |
| Demo 入口与导航 | `src/main.ts` + `examples/*.html` | `rspack.config.ts` entry + Html plugin | 新增 demo 只需加 entry/html | 已覆盖 |
| 公共导出 API | `src/index.ts` | `engine/*`、`layers/*`、`tiles/*`、`spatial/*` | 新增导出/实验导出 | 部分覆盖（README 导出表过时） |
| 按需渲染/交互 | `GlobeEngine#setView/getView/on/pick` | `src/engine/GlobeEngine.ts`、`src/core/CameraController.ts` | `LayerContext.requestRender` | 已覆盖（缺少概念文档） |
| SurfaceTile 瓦片渲染（影像+高程） | `SurfaceTileLayer` | `src/layers/SurfaceTileLayer.ts`、`src/tiles/*` | `selectTiles/loadImageryTile/loadElevationTile/coordTransform` | 已覆盖（有 open issues） |
| 高德/百度坐标偏移对齐 | `SurfaceTileLayerOptions.coordTransform` | `src/layers/SurfaceTileLayer.ts` | 回调注入 | 已覆盖（示例+计划文档齐） |
| VectorTile（MVT） | `VectorTileLayer`（已导出） | `src/layers/VectorTileLayer.ts` | `style/layerFilter`（概念层面） | 待补齐（当前为占位实现） |
| 文档资产与过程记录 | `docs/*` | `docs/architecture/*`、`docs/plans/*`、`docs/checkpoints/*` | —— | 已覆盖（但层级/状态混杂） |

## 4. 实现原理深度拆解

### 4.1 引擎装配与按需渲染

- 功能目标：在不常驻帧循环的前提下，实现可交互地球 + 图层系统，并在交互/状态变化时触发渲染
- 入口 API：`new GlobeEngine(...)`、`GlobeEngine#addLayer/removeLayer/setView/on/pick`
- 核心调用链：
  - 交互改变视角：`CameraController` 触发 `onChange` → `GlobeEngine.handleCameraChange()` → `GlobeEngine.render()`
  - 图层请求重绘：`LayerContext.requestRender()` → `GlobeEngine.requestRender()`（`requestAnimationFrame` 合帧）
  - 渲染主链：`GlobeEngine.render()` → `CameraController.update()` → `LayerManager.update()` → `RendererAdapter.render()`
- 关键结构：`GlobeEngine`、`LayerManager`、`CameraController`、`EventEmitter`
- 不变量：
  - 引擎不默认常驻 `FrameLoop`；惯性由 `CameraController` 自己驱动 rAF（只有在有惯性时才持续触发）
  - 图层通过 `LayerContext` 反向请求引擎渲染（避免图层直接依赖 renderer）
- 错误语义：引擎层未统一封装错误边界；tile 加载失败主要由具体 layer 自行处理（见 `SurfaceTileLayer` 的 `console.error`）
- 复杂度热点：高频交互下的 tile 选择 + 异步 tile 资源加载/解码

证据：

- `src/engine/GlobeEngine.ts` :: `render` / `requestRender` / `pick`
- `src/core/CameraController.ts` :: `handleInertiaFrame` / `onChange`
- `src/layers/LayerManager.ts` :: `update` / `pick`
- 测试：`tests/engine/RenderScheduling.test.ts`、`tests/core/CameraController.test.ts`

### 4.2 SurfaceTileLayer 瓦片链路（影像 + Terrarium 高程）与 LOD 选择

- 功能目标：按视口与相机选择可见瓦片集合，逐瓦片生成曲面 patch mesh，贴影像并按 DEM 位移顶点；离开视野即回收
- 入口 API：`new SurfaceTileLayer(id, options)`；引擎侧通过 `engine.addLayer(layer)` 接入
- 核心调用链（关键路径）：
  - `SurfaceTileLayer.update()` → `syncTiles()`
  - `syncTiles()` → `selectTiles()`（默认 `selectSurfaceTileCoordinates`）
  - `selectSurfaceTileCoordinates()` → `TileViewport.computeTargetZoom()` + `TileViewport.computeVisibleTileCoordinates()`（屏幕采样射线命中球面得到 tile 包围盒）
  - `ensureTile()` → `TileScheduler.request()`（影像/高程分别调度）→ `defaultTileLoader()` / `defaultElevationLoader()`
  - 高程解码：`TerrariumDecoder.decode()`（支持 Worker：`src/workers/terrariumDecodeWorker.ts`）
  - 网格生成：`buildSurfaceTileGeometry()`（含 skirt、防缝 UV inset、可选 `coordTransform`）
- 关键结构：`TileCache`（LRU）、`TileScheduler`（FIFO 并发）、`SurfaceTileTree`（混合 LOD 叶子集）、`StaleSurfaceTileError`（防止过期加载污染）
- 不变量：
  - tile key 恒为 `z/x/y`
  - `SurfaceTileLayer.onAdd` 会将 `context.globe.mesh.visible = false`，以 tile mesh 作为可见地表
  - mesh 边缘通过 skirt 抑制裂缝（并根据邻接 tile 动态选择哪些边需要 skirt）
- 错误语义：
  - 通过 `isCurrent()` + `StaleSurfaceTileError` 终止“过期 tile”后续工作
  - 非 stale 错误：打印错误并从 `activeTiles` 删除；错误向上抛出（会让 `ready()` reject）
- 复杂度热点：
  - `computeVisibleTileCoordinates` 的采样密度与 tile churn（见 `tests/tiles/SurfaceTileTree.test.ts` 里的诊断输出）
  - tile 资源加载/解码（缺少 AbortSignal + cancel，见 open issues）

证据：

- `src/layers/SurfaceTileLayer.ts` :: `syncTiles` / `ensureTile` / `loadTileMesh` / `buildSurfaceTileGeometry`
- `src/tiles/SurfaceTileTree.ts` :: `selectSurfaceTileCoordinates`
- `src/tiles/TileViewport.ts` :: `computeTargetZoom` / `computeVisibleTileCoordinates`
- `docs/tile-rendering-open-issues.md` :: Issue #3/#5/#6（调度优先级、AbortController、TTL）
- 测试：`tests/layers/SurfaceTileLayer.test.ts`、`tests/tiles/SurfaceTileTree.test.ts`

### 4.3 文档与实现一致性：以“可复现验证”为准

本仓库的 docs 中存在多份“验收通过”的声明，但当前工作区实际验证结果为：

- `npm run test:run`：**失败**（41 个文件、204 个测试，其中 3 个失败，全部来自 `tests/layers/SurfaceTileLayer.test.ts`）
- `npm run typecheck`：通过
- `npm run build`：通过（Rspack 产生体积告警；`dist/three.js` ~486KB，`dist/core.js` ~14KB）

3 个失败测试的根因指向同一处逻辑假设：`SurfaceTileLayer.syncTiles()` 以相机位移 hash 作为“无需重算 selection”的条件，导致当 `selectTiles` 是外部注入且 selection 在相机未动时变化，会被错误跳过（测试中就是这种场景）。

证据：

- `tests/layers/SurfaceTileLayer.test.ts`（断言变更 selection 后应重建 active tiles）
- `src/layers/SurfaceTileLayer.ts` :: `lastCameraMatrixHash` / early-return（`cameraHash === lastCameraMatrixHash` 时直接返回）

## 5. 可优化点

| ID | 领域 | 当前瓶颈 | 优化方案 | 预期收益 | 代价与影响 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| O-01 | DOCS | `README.md` 示例与现实不一致（仍含 `TiledImageryLayer`） | 更新 Quick Start + 导出表，统一到 `SurfaceTileLayer` | 降低上手成本，避免“照抄即报错” | 低；仅文档改动 | `README.md`、`docs/plans/remove-tiled-imagery-layer.md`、`src/index.ts` |
| O-02 | DOCS | `README.md` 指向不存在的 `docs/api/` | 创建 `docs/api/`（手写或 TypeDoc 生成）或移除引用 | 降低迷惑度，建立可导航入口 | 中；需要维护策略 | `README.md` |
| O-03 | DOCS | docs 类型混杂、缺少“入口/目录/状态” | 增加 `docs/index.md` + `docs/status.md`（每条能力链接到源码/测试/示例） | 提升文档可信度与检索效率 | 中；需要一次性梳理 | `docs/` 目录结构 |
| O-04 | DOCS | plan 文档混入工具执行指令（“For Claude”） | 将执行指令迁出到 `.codex/` 或在 docs 中改为“可读的人工步骤” | 面向人类读者更清晰 | 低-中；可能影响 agent 流程 | `docs/plans/*.md` |
| O-05 | DOCS | “验收报告”中的版本/测试数量/完成度与代码不一致 | 将验收报告改为“目标/历史记录”，或引入可复现的“验证快照”（日期+命令+输出摘要） | 避免误导，减少维护成本 | 中；需要定规则 | `docs/acceptance/enhanced-map-engine.md`、`package.json`、`npm run test:run` |
| O-06 | CODE | `SurfaceTileLayer` selection 缓存假设过强，导致测试不全绿 | 仅在默认 `selectTiles` 时启用缓存，或引入显式 `invalidateSelection()` | 恢复测试全绿，避免真实项目踩坑 | 低-中；小范围逻辑改动 | `src/layers/SurfaceTileLayer.ts`、`tests/layers/SurfaceTileLayer.test.ts` |
| O-07 | CODE/DOCS | open issues 中的 TileScheduler cancel/AbortController/TTL 未落地 | 按 `docs/tile-rendering-open-issues.md` 逐项实现 | 大幅降低“快速移动相机”浪费请求 | 中-高；需改动 tileLoader/scheduler | `docs/tile-rendering-open-issues.md`、`src/tiles/*` |

## 6. 风险登记

| ID | 风险描述 | 分类 | 严重度 | 概率 | 可探测性 | 缓解措施 | 责任人 | 剩余风险 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | README/验收文档与实现不一致，导致使用者按文档使用会报错或产生错误预期 | 兼容性 | 高 | 高 | 容易 | 建立 docs 状态标注；以命令输出为准；修复 README | 维护者 | 中 |
| R-02 | `VectorTileLayer` 已导出但仍为占位实现，可能被误用并造成“功能缺失”争议 | 正确性 | 高 | 中 | 容易 | 标注为实验性能力，或在 README/API 文档中明确“未实现” | 维护者 | 中 |
| R-03 | `docs/acceptance/threejs-globe-engine.md` 声称“网络失败降级/程序化回退”，当前 demo 未必满足 | 正确性 | 中 | 中 | 一般 | 明确哪些 demo 支持回退；或补齐回退实现/更新验收口径 | 维护者 | 低-中 |
| R-04 | 第三方瓦片源存在 CORS/服务条款风险（高德/百度尤其明显） | 合规 | 中 | 中 | 困难 | 文档明确“仅 demo”；建议自建/合法瓦片服务；提供替代数据源配置 | 维护者 | 中 |
| R-05 | 构建产物存在体积告警，文档若宣称“轻量/小体积”但缺少定义易被质疑 | 运维 | 中 | 中 | 容易 | 文档中区分三方依赖与业务代码；给出可复现的测量方法（gzip/brotli） | 维护者 | 低 |
| R-06 | 当前单测不全绿（SurfaceTileLayer 3 例失败），会影响迭代信心与文档“已验证”可信度 | 运维 | 高 | 高 | 容易 | 先修复失败测试并回归；再更新验收报告 | 维护者 | 低 |

## 7. 嫁接蓝图

### 7.1 能力映射

| 源能力 | 目标对应能力 | 差距 | 决策模式 | 说明 |
| --- | --- | --- | --- | --- |
| `README.md`（开发/快速开始/API 概览） | 面向使用者的“快速开始 + API 概览” | 示例与导出表过时；缺少 docs 导航 | 需要适配 | 先修正文档事实，再拆分为 `docs/` 内的可导航结构 |
| `docs/acceptance/*` | “可复现验证快照” + “人工验收清单” | 版本/测试数/完成度不一致 | 需要重设计 | 将“结果”与“口径”分离：口径保留、结果通过命令快照生成 |
| `docs/architecture/*` | 面向研发的“架构与路线图” | 更偏愿景，缺少“现状实现映射” | 需要适配 | 增加一页“现状架构图（按 src 目录）”并标注差距 |
| `docs/plans/*` | 工程计划（可执行） | 混入 agent 指令；难面向人类阅读 | 需要适配 | 抽出“计划摘要（人类可读）”与“执行脚本/提示词（agent）” |
| `docs/checkpoints/*` | 研发过程归档 | 内容过长，属于过程而非产品 docs | 不采用 | 建议迁移到 `.codex/` 或保留但在 docs/index 明确“仅内部过程记录” |
| `docs/tile-rendering-open-issues.md` | 真实的“技术债/问题单” | 需要与 issue/里程碑绑定 | 直接复用 | 内容质量高，建议保持为权威来源并建立闭环流程 |

### 7.2 架构方案

- 集成边界（面向读者分层）：
  - 使用者文档：快速开始、API、概念（坐标系/投影/瓦片/图层/拾取）
  - 研发文档：架构、模块边界、关键算法、性能与调试
  - 过程文档：计划、断点续跑、验收记录（与上两者物理隔离或强标注）
- 适配层设计（文档元数据）：
  - 每份 docs 头部统一包含：`状态（草案/提议/已实现/已废弃）`、`最后验证日期`、`验证命令`、`相关源码/测试链接`
- 数据转换策略（把“声明”变成“证据”）：
  - 将“测试数量/通过”改为命令快照（日期+Vitest summary）
  - 将“包体积”改为 `dist/` 文件清单 + gzip/brotli 命令
- 向后兼容策略：
  - 旧 doc 保留但加“已过时/仅历史”标识，并在 `docs/index.md` 给出最新入口

### 7.3 分阶段交付

1. 第一阶段（本周）：修复 README 失真点 + 增加 docs 入口与状态页 + 先修复当前失败测试以恢复“可验证基线”
2. 第二阶段（2-6 周）：补齐 API 文档（TypeDoc 或手写）+ 关键概念文档（瓦片/坐标/投影/图层/拾取）+ 将 acceptance 结果改为可复现快照
3. 第三阶段（6+ 周）：建立 CI（test/typecheck/build + docs lint）+ 将 open issues 与里程碑绑定并持续闭环

## 8. 验证与发布计划

### 验证矩阵

| 目标 | 验证类型 | 命令/方法 | 通过标准 |
| --- | --- | --- | --- |
| 事实一致性（docs→代码） | 单元 | `rg -n "TiledImageryLayer|docs/api" README.md` | 0 处“引用已删除/不存在资源” |
| 单测基线 | 单元 | `npm run test:run` | 全部通过（当前为不通过，需先修复） |
| 类型基线 | 单元 | `npm run typecheck` | 0 errors |
| 构建基线 | 集成 | `npm run build` | build 成功；体积告警有解释与指标口径 |
| 关键 demo 人工验收 | 人工 | `npm run dev` + 打开 demo | 与 `docs/acceptance/threejs-globe-engine.md` 口径一致或更新口径 |

### 发布与回退

- 发布策略：先在仓库内完成 docs 治理（对内）；若未来开源，再以站点/README 同步发布
- 观测指标：文档入口点击路径（是否可从 README → docs/index → API/概念）；新同学上手耗时；Issue 里“文档不一致”数量
- 回退触发条件：docs 更新引发大量“按文档操作失败”反馈；或 CI 验证不通过
- 回退步骤：回滚到上一个 docs tag/commit；保留变更草稿到 `docs/analysis/` 并重新梳理证据

## 9. 完美嫁接验收结论

### 9.1 验收矩阵（全部必过才可宣称“完美嫁接”）

| 验收项 | 目标标准 | 结果（通过/不通过） | 证据 |
| --- | --- | --- | --- |
| 能力对齐 | 范围内能力对齐率 = 100% | 不通过 | README/验收报告与当前实现不一致 |
| API 语义对齐 | 入参/返回/错误/时序 = 100% 对齐 | 不通过 | `VectorTileLayer.parseTile()` 占位实现；对外语义不明确 |
| 性能达标 | 满足约定阈值 | 不通过 | 性能/体积口径未形成可复现基线（仅有目标/部分输出） |
| 风险闭环 | 严重/高风险 = 0 未闭环项 | 不通过 | docs 误导 + 单测不全绿 |
| 兼容性 | 平台/版本/运行时/依赖通过 | 通过 | 浏览器构建可运行（`npm run build` 通过） |
| 稳定性与安全 | 回归/稳定性/安全验证通过 | 不通过 | `npm run test:run` 当前不通过 |
| 合规性 | 许可证/合规可行 | 不通过 | Private 状态下未形成对外发布合规结论 |

### 9.2 最终判定规则

- 仅当验收矩阵全部“通过”，可写“可完美嫁接”。  
- 任一“不通过”，必须写“不可完美嫁接”，并给出整改路径与预计成本。

## 10. 待确认问题

1. 文档主要面向谁：内部研发？还是计划开源对外？（决定 `docs/` 分层与投入）
2. `VectorTileLayer` 是否要继续“对外导出”？若短期不实现，是否标记为“实验性（experimental）”或从 `src/index.ts` 移除导出？
3. `docs/checkpoints/*` 与 `docs/plans/*` 是否可以迁移到 `.codex/`（或至少在 `docs/index.md` 明确“仅内部过程”）？

## 11. 最终建议

### 现在（0-2 周）

- 修复 `tests/layers/SurfaceTileLayer.test.ts` 当前 3 个失败用例对应的实现问题，恢复“可验证基线”
- 修复 `README.md` 中 `TiledImageryLayer` 与 `docs/api/` 的失真点，保证“照抄可跑”
- 新增 `docs/index.md`（文档导航）与 `docs/status.md`（实现清单 + 已知缺口 + 证据链接）

### 下一步（2-6 周）

- 建立 API 文档策略：TypeDoc 生成（推荐）或手写 `docs/api/*`，与 `src/index.ts` 一致
- 补齐关键概念文档：瓦片坐标系、投影与坐标转换、图层生命周期、拾取事件模型、CORS/Worker 注意事项
- 将 `docs/acceptance/*` 改为“口径 + 可复现验证快照”两部分，避免硬编码测试数量

### 后续（6+ 周）

- 建立 CI：`test/typecheck/build` + docs 检查（避免引用不存在符号/文件）
- 按 `docs/tile-rendering-open-issues.md` 路线逐项闭环（TileScheduler 优先级/取消、AbortController、TileCache TTL）
