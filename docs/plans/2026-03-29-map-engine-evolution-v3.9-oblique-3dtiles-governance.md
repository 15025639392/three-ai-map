# Three-Map v3.9 倾斜摄影（3D Tiles 接入与治理收口）

## 目标

- 在 `v3.8` 骨架能力上补齐真实 `3D Tiles` 接入适配，形成“数据格式 -> 层能力 -> demo -> smoke/baseline -> CI”闭环。
- 对 Q6/Q7 给出可执行治理口径：格式与测试数据治理策略落盘，进入 `v4.0` 数据集扩展阶段。

## 本轮实现

1. `3D Tiles` 适配能力
   - 新增 `src/layers/ObliquePhotogrammetry3DTiles.ts`，支持 `boundingVolume.region` 转换到 oblique 节点结构。
   - 支持 `extras.obliqueCenter` 兜底输入，允许非 region 的测试夹具注入。
   - 新增导出：`convert3DTilesToObliquePhotogrammetryTileset` 与 `ThreeDTiles*` 类型。

2. Oblique 图层接缝升级
   - `ObliquePhotogrammetryLayer` 新增 `tileset3DTiles` / `loadTileset3DTiles` / `tileset3DTilesUrl`。
   - 新增 `threeDTilesMetersToAltitudeScale`，默认 `1 / 6378137`。

3. 回归 demo 切换到 3D Tiles 输入
   - `examples/oblique-photogrammetry-regression.ts` 使用 `tileset3DTiles` fixture 驱动。
   - 保持门禁指标口径不变：`visibleNodeCount`、`maxVisibleDepth`、`pickHit*`、`allExpected`。

4. 自动化验证增强
   - 新增 `tests/layers/ObliquePhotogrammetry3DTiles.test.ts`：
     - region 层级转换正确性；
     - 非法节点拒绝；
     - 图层直接加载 3D Tiles fixture。

## 治理决议（Q6/Q7）

- Q6（格式）：
  - 决议：首期引擎内接入格式固定为 `3D Tiles (tileset.json)`；
  - OSGB/I3S 不做引擎内直读，要求离线转换到统一 `3D Tiles` 入口。
- Q7（数据治理）：
  - 决议：仓库默认仅保留小体量 deterministic fixture；
  - 中大型测试集采用远程下载或私有制品仓，仓库只保留清单与校验元信息。

## 验证记录

- `npm run typecheck`：PASS
- `npm run test:run -- tests/layers/ObliquePhotogrammetryLayer.test.ts tests/layers/ObliquePhotogrammetry3DTiles.test.ts tests/main.test.ts`：PASS
- `npm run test:map-engine`：PASS（`43` files / `240` tests / `23` deterministic browser smoke + baseline）

## 下一步（唯一）

- 进入 `v4.0`：接入真实 3D Tiles 测试数据清单与下载校验链路，并扩展 oblique 性能漂移门禁。
