# 06 Coordinate System And Precision

## 1. 目标与边界

本章解决三类基础稳定性问题：

1. 坐标方向错误（东/西反向、画面镜像）
2. 高倍率视角抖动（float 精度不足）
3. 交互方向与地理方向不一致（上下左右语义错位）

本章聚焦“坐标主干 + 精度策略 + 验证闭环”，不讨论瓦片选择与调度策略。

---

## 2. Cesium 的坐标主干（统一语义）

Cesium 的主干是分层坐标，不是单一 `Vector3`：

1. `Cartographic`：经纬高（lon/lat/height）
2. `Cartesian3`：ECEF 世界坐标
3. 投影层：2D/CV 使用 Geographic/WebMercator
4. GPU 层：RTE/RTC 做高精度渲染

关键源码：

- `packages/engine/Source/Core/Cartographic.js`
- `packages/engine/Source/Core/Ellipsoid.js`
- `packages/engine/Source/Core/EncodedCartesian3.js`
- `packages/engine/Source/Core/Transforms.js`
- `packages/engine/Source/Shaders/Builtin/Functions/translateRelativeToEye.glsl`

---

## 3. 方向约定（必须写死的规范）

地球引擎需要固定一套不可漂移的方向约定：

1. 世界坐标右手系
2. ENU 局部坐标：`East / North / Up`
3. 视图交互语义：`上北下南左西右东`

一旦选定，不允许通过 CSS 或后处理再镜像修正。

原因：

- 镜像补丁只会掩盖映射错误
- 交互、拾取、瓦片索引和渲染会长期不一致

---

## 4. 经纬到 ECEF 的单向映射（禁止双向补丁）

正确做法：

1. `lng/lat` 先转弧度
2. 用椭球模型计算 ECEF（WGS84）
3. 一致地进入世界变换链

错误做法：

- 在中间层把 `x` 取负再用 `scaleX(-1)` 补偿
- 在相机输入层和渲染层各做一次“反向修正”

结果会造成：

- 东西方向错反复出现
- 代码路径分叉，回归难以收敛

---

## 5. 右手系迁移常见遗漏项

把旧坐标实现替换为右手系后，最常漏改的是：

1. 交互增量映射（drag/pan 的经纬增量符号）
2. 相机 yaw/pitch 与地理方位换算符号
3. 瓦片 x 方向索引增减规则
4. 拾取射线与地理转换函数中的轴向约定
5. 法线与切线基（ENU）构建的叉乘顺序

只改一处会出现“局部看似正确，整体仍镜像”的假象。

---

## 6. 输入交互方向的正规定义

推荐统一定义（地球正视图）：

- 向右拖动画面：中心经度减小（视图向西移）
- 向左拖动画面：中心经度增大（视图向东移）
- 向上拖动画面：中心纬度减小（视图向南移）
- 向下拖动画面：中心纬度增大（视图向北移）

注意：这是“拖动画面”的语义，不是“相机在世界里移动”的语义，必须统一为用户可感知方向。

---

## 7. 精度策略：RTE + RTC 双层

## 7.1 GPU RTE（Relative To Eye）

做法：

- CPU 将大坐标拆成 `high/low` 两部分
- shader 中做相机相对平移计算

作用：

- 抑制远距离大数减法导致的抖动

## 7.2 Tile RTC（Relative To Center）

做法：

- 每个 tile 以局部中心 `u_center3D` 为参考
- 顶点用局部小坐标存储

作用：

- 降低 tile 内顶点量级，减少边界抖动

结论：

- RTE 解决“全局大坐标”
- RTC 解决“tile 局部细节”
- 两者应叠加使用

---

## 8. 投影分支一致性（3D/2D/CV）

3D 与 2D/CV 可使用不同投影，但必须共享方向语义：

1. 经纬增减方向一致
2. 东西/南北判定一致
3. pick 结果回转 `Cartographic` 一致

如果 2D 分支单独反号，会在模式切换时出现方向跳变。

---

## 9. 与 three-map 的落地映射（干净实现）

遵循“不保留旧兼容代码”时，建议直接执行：

1. 删除所有视觉镜像补丁（例如 DOM `scaleX(-1)`）
2. 在 `geo/projection` 统一维护经纬->世界坐标链
3. 在 `CameraController` 统一维护拖拽方向映射
4. 在 surface/tiles 侧统一 x/y 索引与方向定义
5. 保持一条 ENU 构建路径，禁止多版本函数并存

强约束：

- 不允许“新坐标链 + 旧补丁”同时存在
- 不允许通过 UI 层 transform 掩盖内核坐标错误

---

## 10. 自动化回归清单（方向与精度）

建议最少覆盖：

1. 固定视角下，键盘/拖拽 `上下左右` 对应 `北南西东`
2. `lng` 增加时，地表特征向左移动（视图向东）
3. `lng` 减少时，地表特征向右移动（视图向西）
4. 高倍率俯视连续缩放，无明显顶点抖动
5. 模式切换（3D/2D/CV）后方向不翻转

---

## 11. 典型故障与归因

故障 1：画面左右反（东/西颠倒）  
归因：经纬->世界坐标链中某层轴符号错误，靠镜像补丁掩盖  
修复：移除补丁，逐层核对符号与叉乘顺序

故障 2：删除镜像后画面“看起来又反了”  
归因：交互层仍沿用旧符号，坐标层与输入层不一致  
修复：统一交互增量与地理语义

故障 3：高空抖动或地形边缘闪烁  
归因：仅用 float 世界坐标，无 RTE/RTC  
修复：引入 high/low 编码与 tile 局部中心

---

## 12. 对应 Cesium 参考源码

- `packages/engine/Source/Core/Cartographic.js`
- `packages/engine/Source/Core/Ellipsoid.js`
- `packages/engine/Source/Core/Transforms.js`
- `packages/engine/Source/Core/EncodedCartesian3.js`
- `packages/engine/Source/Shaders/Builtin/Functions/translateRelativeToEye.glsl`
- `packages/engine/Source/Shaders/GlobeVS.glsl`

建议阅读顺序：

1. 先看 `Cartographic` 与 `Ellipsoid` 的几何转换
2. 再看 `Transforms`（ENU/矩阵方向）
3. 最后看 shader 里的 RTE 计算链
