# Three-Map v4.0 倾斜摄影（数据治理与漂移门禁）

## 目标

- 将 `v3.9` 的 3D Tiles 接入扩展为可执行的数据治理链路：manifest、schema、下载、校验。
- 将 oblique regression 从单轮采样升级为多轮漂移约束，纳入 smoke + baseline 双门禁。

## 本轮实现

1. Oblique 漂移门禁升级
   - `examples/oblique-photogrammetry-regression.ts` 升级为 3 轮 baseline/near/recovery 循环。
   - 新增指标：`driftCycleCount`、`recoveryStableCount`、`nearPickHitCount`、`visibilityDriftMax`。
   - `scripts/browser-smoke-surface-tile-regression.mjs` 与 `scripts/assert-map-engine-metrics-baseline.mjs` 同步新增断言。
   - `scripts/map-engine-metrics-baseline.config.json` / `.linux.json` / `.macos.json` 同步新增区间并把 `sequenceStepCount` 更新到 `9`。

2. 3D Tiles 数据治理落地
   - 新增 manifest：`docs/datasets/oblique-3dtiles-manifest.json`。
   - 新增 schema：`docs/datasets/oblique-3dtiles-manifest.schema.json`。
   - 新增校验脚本：`scripts/validate-oblique-3dtiles-manifest.mjs`（支持 `--strict-remote`，默认只强制本地 fixture）。
   - 新增下载脚本：`scripts/download-oblique-3dtiles-datasets.mjs`（支持 `--id <dataset-id>`）。
   - npm scripts：`datasets:oblique:validate`、`datasets:oblique:download`。

3. CI/本地统一质量入口接缝
   - `scripts/run-map-engine-checks.sh` 先执行 `npm run datasets:oblique:validate`，再进入 typecheck / unit / browser smoke / baseline。
   - `.gitignore` 新增 `test-data/oblique/datasets/`，确保远程样本缓存不入库。

## 验证记录

- `npm run datasets:oblique:validate`
- `npm run datasets:oblique:download -- --id cesium-discrete-lod-reference`
- `npm run datasets:oblique:validate -- --strict-remote`
- `npm run test:map-engine`

## 下一步（唯一）

- 进入 `v4.1`：增加“远程 3D Tiles 样本不可达/checksum 失配”故障注入回归用例，补齐下载链路负向门禁。
