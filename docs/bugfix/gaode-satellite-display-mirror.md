# GlobeEngine 全局左右镜像修复

## 0) 元信息（必填）

- 缺陷标题：`GlobeEngine` 默认输出存在全局左右镜像；`scene.scale.x = -1` 能纠正视觉但会导致瓦片覆盖不全
- 修复模式：`标准`
- 来源：用户反馈 `bugfix:examples`
- 负责人：Codex
- 更新时间：2026-03-29

## 1) 缺陷单（必填）

- 严重级别：`P2`
- 影响范围：所有使用 `GlobeEngine` 默认显示路径的示例，已确认 `examples/basic-globe`、`examples/gaode-satellite`、`examples/gaode-satellite-labels`、`examples/gaode-road`
- 首次出现版本：当前仓库主线（首次引入版本未知）
- 复现环境：macOS，本地 `dist/*.html` + Headless Chrome，网络可访问 OSM / 高德瓦片
- 是否已稳定复现：`是`
- 失败测试或复现命令：打开 `dist/basic-globe.html` 与 `dist/gaode-satellite.html`；对比 `test-results/basic-globe-mirror-regression.png`、`test-results/basic-globe-mirror-fixed.png`、`test-results/gaode-satellite-scene-flip-temp.png`
- 复现步骤：运行 `basic-globe` 或高德示例；观察中国/东亚视角下东西方向左右颠倒；再将 `scene.scale.x = -1` 应用于整场景，观察视觉变正但边缘瓦片覆盖出现缺口
- 期望结果：所有示例视觉方向正确，且瓦片覆盖、拾取、拖拽与未镜像场景保持一致
- 实际结果：默认输出全局左右反；直接翻转 scene 会让渲染世界与瓦片选择世界不一致，导致覆盖不全

## 2) 根因分析（RCA）

- 直接原因：`GlobeEngine` 之前只在高德示例中按需启用显示层镜像，默认引擎路径仍然输出左右镜像的画面；`scene.scale.x = -1` 虽能修正视觉，但不会同步改变瓦片选择、拾取和交互使用的屏幕坐标链路
- 深层原因：这个问题本质上是引擎默认显示层需要做水平镜像，而不是只在单个 source / scene / UV 层面做局部翻转；局部翻转会让渲染结果与选择链路失配
- 证据链（日志/断点/调用链）：`test-results/basic-globe-mirror-regression.png` 证明 `basic-globe` 也存在同样左右镜像；`test-results/gaode-satellite-scene-flip-temp.png` 证明用户用 `scene.scale.x = -1` 看到的目标视觉是正确的；将 `mirrorDisplayX` 提升为引擎默认后，`test-results/basic-globe-mirror-fixed.png`、`test-results/gaode-satellite-global-default-verify.png`、`test-results/gaode-satellite-labels-mirror-display.png`、`test-results/gaode-road-mirror-display.png` 均表现正确；新增/更新回归测试覆盖 `tests/core/CameraController.test.ts`、`tests/engine/GlobeEngine.test.ts`、`tests/examples/tile-sources-gaode-baidu.test.ts`
- 为什么此前未被发现：前一轮只在高德网络示例上观察到问题，先做了局部止血；在 `basic-globe` 上补浏览器证据后，才确认这是 `GlobeEngine` 默认显示路径的全局问题

## 3) 修复计划

- 最小改动策略：保留上一轮已经落地的显示层镜像链路，只把 `GlobeEngine` 的 `mirrorDisplayX` 从示例 opt-in 提升为默认开启，继续复用已适配好的 drag / pick remap
- 影响文件：`src/engine/GlobeEngine.ts`、`tests/engine/GlobeEngine.test.ts`、`docs/bugfix/gaode-satellite-display-mirror.md`、`docs/bugfix/gaode-satellite-display-mirror.checkpoint.md`、`docs/bugfix/gaode-satellite-display-mirror.scorecard.md`
- 风险点：`mirrorDisplayX` 现在是默认行为；外部自定义屏幕坐标逻辑若绕过引擎 API，需要自己考虑镜像映射或显式关闭该选项
- 防回归动作：新增默认画布镜像测试、默认镜像 pick 测试、显式关闭镜像测试，并保留 `basic-globe` 与高德示例的浏览器截图证据
- 回滚方案：将 `GlobeEngine` 构造函数中的 `mirrorDisplayX` 默认值改回 `false`

## 4) 验证记录

- 冒烟命令：`npm run typecheck`
- 定向回归命令：`npx vitest run tests/engine/GlobeEngine.test.ts tests/engine/EventSystem.test.ts tests/examples/basic-globe.test.ts tests/examples/tile-sources-gaode-baidu.test.ts`
- 全量门禁（如需）：`npm run test:run`、`npm run build`、Headless Chrome 打开 `dist/basic-globe.html`、`dist/gaode-satellite.html`，并保留此前的高德标签/道路证据图
- 结果总结：类型检查通过；定向回归 28/28 通过；全量测试 233/233 通过；构建通过；`test-results/basic-globe-mirror-fixed.png` 证明默认示例已回正，`test-results/gaode-satellite-global-default-verify.png`、`test-results/gaode-satellite-labels-mirror-display.png`、`test-results/gaode-road-mirror-display.png` 证明此前高德修复未回退，且没有再触发瓦片覆盖缺口

## 5) 发布后观测（高风险必填）

- D0 指标：标准模式不适用，本地浏览器截图已确认默认示例与高德示例的视觉方向与覆盖完整性
- D+1 指标：标准模式不适用
- D+2 指标：标准模式不适用
- 是否关闭事件：`是`

## 6) 质量评分（必填）

- 评分卡文件：`docs/bugfix/gaode-satellite-display-mirror.scorecard.md`
- 当前总分：`95`
- 是否可进入下一阶段：`是`
- 若否，补齐项（owner + 截止时间）：`无`
