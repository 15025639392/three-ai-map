# 高德卫星示例视觉镜像修复

## 0) 元信息（必填）

- 缺陷标题：高德卫星示例左右视觉不对，`scene.scale.x = -1` 虽能纠正视觉但会导致瓦片覆盖不全
- 修复模式：`标准`
- 来源：用户反馈 `bugfix:examples`
- 负责人：Codex
- 更新时间：2026-03-29

## 1) 缺陷单（必填）

- 严重级别：`P2`
- 影响范围：`examples/gaode-satellite`、`examples/gaode-satellite-labels`、`examples/gaode-road`
- 首次出现版本：当前仓库主线（首次引入版本未知）
- 复现环境：macOS，本地 `dist/*.html` + Headless Chrome，网络可访问高德瓦片
- 是否已稳定复现：`是`
- 失败测试或复现命令：打开 `dist/gaode-satellite.html`；对比 `test-results/gaode-satellite-smoke.png`、`test-results/gaode-satellite-scene-flip-temp.png`
- 复现步骤：运行原始高德卫星示例；观察中国视角下底图左右方向；再将 `scene.scale.x = -1` 应用于整场景，观察视觉变正但边缘瓦片覆盖出现缺口
- 期望结果：高德示例视觉方向正确，且瓦片覆盖、拾取、拖拽与未镜像场景保持一致
- 实际结果：原始示例视觉左右反；直接翻转 scene 会让渲染世界与瓦片选择世界不一致，导致覆盖不全

## 2) 根因分析（RCA）

- 直接原因：`scene.scale.x = -1` 修正的是最终画面方向，但不会同步改变瓦片选择、拾取和交互使用的相机/屏幕坐标链路
- 深层原因：这个问题本质上需要的是“显示层水平镜像”，而不是“世界坐标或瓦片源镜像”；把镜像施加到 scene、tile x 或 UV 上都会让渲染结果与选择链路失配
- 证据链（日志/断点/调用链）：`test-results/gaode-satellite-smoke.png` 显示原始视觉左右不对；`test-results/gaode-satellite-scene-flip-temp.png` 证明用户的 scene 翻转目标视觉是正确的；`test-results/gaode-satellite-mirror-display.png`、`test-results/gaode-satellite-labels-mirror-display.png`、`test-results/gaode-road-mirror-display.png` 证明改为显示层镜像后 3 个高德示例视觉正确且未再出现 coverage 缺口；新增回归测试覆盖 `tests/core/CameraController.test.ts`、`tests/engine/GlobeEngine.test.ts`、`tests/examples/tile-sources-gaode-baidu.test.ts`
- 为什么此前未被发现：现有测试主要覆盖 tile selection / geometry / lifecycle，没有对网络型高德示例的最终视觉方向做浏览器证据门禁

## 3) 修复计划

- 最小改动策略：回退错误的 tile x / UV 镜像实验；在 `GlobeEngine` 增加按示例 opt-in 的 `mirrorDisplayX`，仅镜像最终 canvas 输出，并同步 remap 拖拽/拾取的屏幕 x 坐标
- 影响文件：`src/engine/EngineOptions.ts`、`src/core/CameraController.ts`、`src/engine/GlobeEngine.ts`、`examples/tile-sources-gaode-baidu.ts`、`tests/core/CameraController.test.ts`、`tests/engine/GlobeEngine.test.ts`、`tests/examples/tile-sources-gaode-baidu.test.ts`
- 风险点：`mirrorDisplayX` 是新的显示层选项，后续若有自定义屏幕坐标逻辑绕过 `GlobeEngine.pick` / `CameraController`，需要同样考虑镜像映射
- 防回归动作：新增画布镜像样式测试、镜像 pick 测试、镜像拖拽方向测试、Gaode 示例接线测试，并保留浏览器截图证据
- 回滚方案：移除 Gaode 示例中的 `mirrorDisplayX: true`，并删除 `GlobeEngine` / `CameraController` 的镜像显示分支

## 4) 验证记录

- 冒烟命令：`npm run typecheck`
- 定向回归命令：`npx vitest run tests/core/CameraController.test.ts tests/engine/GlobeEngine.test.ts tests/examples/tile-sources-gaode-baidu.test.ts`
- 全量门禁（如需）：`npm run test:run`、`npm run build`、Headless Chrome 打开 `dist/gaode-satellite.html`、`dist/gaode-satellite-labels.html` 并额外生成高德道路取证页截图
- 结果总结：类型检查通过；定向回归 34/34 通过；全量测试 232/232 通过；构建通过；`test-results/gaode-satellite-mirror-display.png`、`test-results/gaode-satellite-labels-mirror-display.png`、`test-results/gaode-road-mirror-display.png` 均与用户的 `scene.scale.x = -1` 目标视觉一致，但没有再触发瓦片覆盖缺口

## 5) 发布后观测（高风险必填）

- D0 指标：标准模式不适用，本地浏览器截图已确认视觉方向与覆盖完整性
- D+1 指标：标准模式不适用
- D+2 指标：标准模式不适用
- 是否关闭事件：`是`

## 6) 质量评分（必填）

- 评分卡文件：`docs/bugfix/gaode-satellite-display-mirror.scorecard.md`
- 当前总分：`93`
- 是否可进入下一阶段：`是`
- 若否，补齐项（owner + 截止时间）：`无`
