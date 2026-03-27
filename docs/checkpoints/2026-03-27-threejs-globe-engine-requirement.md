# 断点续跑模板（统一）

## 1) 会话快照

- 任务标题：使用 three.js 从 0 开发地球引擎需求规划
- 技能类型：`需求`
- 当前阶段：设计文档与实现计划已落盘
- 更新时间：2026-03-27
- 负责人：Codex

## 2) 当前状态

- 已完成：
  - [x] 读取 `requirement-workflow` 与 `brainstorming` 技能说明
  - [x] 扫描当前仓库状态，确认工作区为空目录
  - [x] 确认当前目录不是 git 仓库
  - [x] 形成首期路线推荐：地图能力优先的收敛版方案
  - [x] 明确将输出 3 套首期架构方案并给出推荐
  - [x] 用户确认采用 B 方案：分层式内核
  - [x] 完成首期模块边界、目录结构与里程碑建议
  - [x] 用户确认数据流、API 与验收口径
  - [x] 设计文档已写入 `docs/plans/2026-03-27-threejs-globe-engine-design.md`
  - [x] 实现计划已写入 `docs/plans/2026-03-27-threejs-globe-engine.md`
- 进行中：
  - [ ] 等待用户决定是否进入实现阶段
- 下一步（唯一）：
  - [ ] 由用户决定是继续执行实现计划，还是仅保留规划结果

## 3) 关键结论与决策

- 决策 1：当前先做需求与设计澄清，不进入实现。
  - 原因：`brainstorming` 要求先澄清目标并获得确认后再出设计。
  - 影响：本轮输出聚焦目标、边界和方案，不创建运行时代码。
- 决策 2：按“少依赖”约束默认采用 `three` + 原生浏览器 API 的技术路线。
  - 原因：这是用户已明确提出的核心约束。
  - 影响：后续方案会优先避免引入 UI 框架、状态库和 GIS 重型依赖。
- 决策 3：推荐首期采用“地图能力优先”的收敛版方案。
  - 原因：纯展示方案起步快，但后续补坐标、图层、拾取、瓦片链路时通常要返工；纯内核方案又太抽象，短期看不到可运行结果。
  - 影响：第一阶段会同时拿到可见成果和可扩展底座，但会严格限制范围，只做最小可用能力。
- 决策 4：首期架构对比聚焦“渲染绑定程度”和“模块拆分颗粒度”。
  - 原因：这两点决定后续是否容易扩到瓦片、覆盖物、交互和插件。
  - 影响：方案对比会围绕单体式、分层式、插件化三条路线展开。
- 决策 5：用户确认采用 B 方案，即“分层式内核”。
  - 原因：它在落地速度与后续扩展之间平衡最好。
  - 影响：后续设计将围绕 `core / geo / layers / engine` 四层展开。
- 决策 6：球体宿主与业务图层分离，球体不视为普通 Layer。
  - 原因：球体承担坐标基底和渲染宿主职责，语义上不同于影像层和标记层。
  - 影响：`globe/` 将独立成模块，`LayerManager` 仅管理覆盖物与影像等业务层。

## 4) 变更与证据

- 涉及文件：
  - `docs/checkpoints/2026-03-27-threejs-globe-engine-requirement.md`
  - `docs/plans/2026-03-27-threejs-globe-engine-design.md`
  - `docs/plans/2026-03-27-threejs-globe-engine.md`
- 执行命令与结果：
  - `ls -la` -> 工作区为空目录
  - `git status --short --branch` -> 当前目录不是 git 仓库
  - `sed -n '1,220p' .../requirement-workflow/SKILL.md` -> 已读取需求流程
  - `sed -n '1,220p' .../brainstorming/SKILL.md` -> 已读取设计澄清流程
- 关键日志/截图/报告路径：
  - `docs/plans/2026-03-27-threejs-globe-engine-design.md`
  - `docs/plans/2026-03-27-threejs-globe-engine.md`

## 5) 风险与阻塞

- 风险：
  - `地球引擎` 范围过大，若不限定首期范围，规划会失真
  - 若首期同时包含地形、影像、矢量、相机控制、标注和交互，复杂度会快速上升
  - 若对外 API 过早追求完备，会把首期拖进抽象设计
- 阻塞：
  - 当前无技术阻塞，等待是否进入实现
- 需要谁确认：
  - `用户`

## 6) 续跑指令（下次直接用）

- 建议提示词（长版）：
  - `继续这个任务，先读取 /Users/ldy/Desktop/map/three-map/docs/checkpoints/2026-03-27-threejs-globe-engine-requirement.md，按“下一步（唯一）”执行，并在每个阶段结束后更新断点文件。`
- 若需要子agent：
  - `基于 /Users/ldy/Desktop/map/three-map/docs/checkpoints/2026-03-27-threejs-globe-engine-requirement.md 拆分并并行执行未完成项，返回统一格式结果。`
