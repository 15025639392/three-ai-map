# Three-Map v4.1 倾斜摄影（下载链路负向门禁）

## 目标

- 为 oblique 3D Tiles 数据治理链路补齐负向回归门禁，确保以下故障可稳定失败并输出可诊断信息：
  - 远程样本不可达；
  - 下载内容 checksum 失配；
  - strict-remote 校验下远程缓存缺失。

## 本轮实现

1. 下载脚本韧性增强
   - `scripts/download-oblique-3dtiles-datasets.mjs` 新增 `OBLIQUE_3DTILES_DOWNLOAD_TIMEOUT_MS`。
   - 对 fetch 网络错误与超时做统一失败信息收口，提升不可达场景可诊断性。

2. 故障注入门禁脚本
   - 新增 `scripts/assert-oblique-3dtiles-failure-gates.mjs`，覆盖三类负向用例：
     - `unreachable-download`：`127.0.0.1:9` 不可达失败；
     - `checksum-mismatch`：本地临时 HTTP 服务返回内容与 manifest checksum 不一致失败；
     - `strict-remote-missing-cache`：`validate --strict-remote` 下缺缓存失败。
   - 门禁要求：必须“失败且命中预期错误信息”才算通过，避免“假通过”。

3. 统一质量入口接缝
   - 新增 npm script：`test:datasets:oblique:fault-gates`。
   - `scripts/run-map-engine-checks.sh` 前置执行：
     - `datasets:oblique:validate`
     - `test:datasets:oblique:fault-gates`
   - 文档同步更新：`README.md`、`docs/agents/map-test-agent-prompt-template.md`。

## 验证记录

- `npm run test:datasets:oblique:fault-gates`
- `npm run datasets:oblique:validate`
- `npm run typecheck`
- `npm run test:run -- tests/layers/ObliquePhotogrammetryLayer.test.ts tests/layers/ObliquePhotogrammetry3DTiles.test.ts tests/main.test.ts`
- `npm run test:browser:surface-tiles`
- `npm run test:metrics:baseline`
- `npm run test:map-engine`

## 下一步（唯一）

- 进入 `v4.2`：将 oblique remote-reference 扩展为多样本清单（含版本钉住策略）并加入下载重试策略门禁。
