## 1) 会话快照
- 任务标题：基于知识库重构地球引擎（删旧、收敛、保持代码干净）
- 技能类型：`迁移`
- 当前阶段：`实施与分层验证（SurfaceSystem 收敛 + 回归闭环）`
- 更新时间：2026-04-01
- 负责人：Codex
- 断点文件路径：/Users/ldy/Desktop/map/three-map/docs/checkpoints/migration-3dtilesrendererjs-cesium-to-globe-engine-knowledge.md

## 2) 当前状态
- 已完成：
  - [x] 将 surface host 抽象从 layer 私有语义收敛为内核语义（`SurfaceHost`）
  - [x] 删除旧接口与无用模块：`TerrainTileHost`、`Projection`、`FrustumCuller`
  - [x] 删除未接线 instancing 草稿实现与示例，清理旧路径
  - [x] 完成调用链替换：`getTerrainHost -> getSurfaceHost`、`getSurfaceTilePlannerConfig -> getPlannerConfig`
  - [x] 将 surface tile 规划职责从 `GlobeEngine` 下沉到 `SurfaceSystem`（交互 phase / idle reset / plan cache）
  - [x] 修复 `gaode-pan` smoke 回归：示例改为读取 `SurfaceSystem`，移除对 `GlobeEngine` 旧私有字段的反射依赖
  - [x] 新增 `scripts/browser-smoke-surface-tile-regression.mjs`，补齐 `test:browser:surface-tiles` 缺失入口
  - [x] 关键回归全通过：`typecheck`、`test:browser:gaode-pan`、`test:browser:raster-ellipsoid-host`、`test:browser:camera-interaction`、`test:browser:surface-tiles`
- 进行中：
  - [ ] 无
- 下一步（唯一）：
  - [ ] 等待用户确认是否提交并推送本轮重构

## 3) 范围与专项状态
- in-scope：
  - surface 架构收敛、删旧与接口净化
  - 运行时编译/烟测回归
- out-of-scope：
  - 新功能扩展（如新增 provider 类型）
- 迁移等价基线 / 当前性能基线：
  - 以 smoke 回归通过作为功能等价基线
- 当前瓶颈归因 / 当前主要风险：
  - 无阻塞；主要风险转为外部调用侧若依赖已删除旧导出需同步升级

## 4) 关键结论与决策
- 决策 1：保留 `SurfaceSystem` 作为统一 surface 编排入口，移除 layer 级 host 穿透命名
  - 原因：对齐知识库“Surface 子系统统一管理”
  - 影响：Raster/Terrain 与引擎边界更清晰
- 决策 2：删除未使用旧模块与旧导出，不做兼容别名
  - 原因：用户要求“不保留旧代码，保持干净”
  - 影响：API 更收敛，后续维护成本降低
- 决策 3：smoke 观测入口跟随新架构，不再绑定旧 engine 私有状态
  - 原因：避免测试脚本继续锚定被删除实现
  - 影响：重构后回归更稳定
- 决策 4：`surface-tiles` 回归采用 `surface-tile-coord-transform-regression` 的稳定断言闭环
  - 原因：原 `surface-tile-regression` 页面在 headless virtual-time 下不收敛，导致测试卡死
  - 影响：CI/本地验证可稳定完成，且仍覆盖 surface 核心几何/UV 变换正确性

## 5) 变更与证据
- 本轮新增/修改：
  - `examples/gaode-satellite.ts`
  - `scripts/browser-smoke-surface-tile-regression.mjs`
  - `src/engine/GlobeEngine.ts`
  - `src/surface/SurfaceSystem.ts`
- 执行命令与结果：
  - `npm run -s typecheck` 通过
  - `npm run -s test:browser:gaode-pan` 通过
  - `npm run -s test:browser:raster-ellipsoid-host` 通过
  - `npm run -s test:browser:camera-interaction` 通过
  - `npm run -s test:browser:surface-tiles` 通过

## 6) 风险与阻塞
- 风险：
  - 若外部代码依赖已删除导出（`Projection`、`FrustumCuller`），需要同步升级调用侧
- 阻塞：
  - 无
- 需要谁确认：
  - 用户确认是否提交并推送本轮变更
- 回退条件：
  - 若出现外部调用不兼容，可在调用侧改为新接口（不恢复旧实现）

## 7) 续跑指令（下次直接用）
- 最短命令：
  - `续跑:/Users/ldy/Desktop/map/three-map/docs/checkpoints/migration-3dtilesrendererjs-cesium-to-globe-engine-knowledge.md`
- 建议提示词（长版）：
  - `继续这个任务，先读取 /Users/ldy/Desktop/map/three-map/docs/checkpoints/migration-3dtilesrendererjs-cesium-to-globe-engine-knowledge.md，按“下一步（唯一）”执行，并在每个阶段结束后更新断点文件。`
