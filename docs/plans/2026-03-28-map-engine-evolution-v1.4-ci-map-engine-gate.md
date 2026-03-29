# Three-Map v1.4 CI 地图引擎门禁接入实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把本地统一质量入口 `npm run test:map-engine` 接入 CI，并上传 deterministic smoke 产物，形成可追溯的回归证据链。

**Architecture:** 新增 GitHub Actions workflow，在 PR / main(master) push / 手动触发下执行 `typecheck + unit tests + browser smoke`；无论成功或失败都上传 `test-results/*.png|*.html|*.json`。

**Tech Stack:** `GitHub Actions`, `node`, `bash`

---

### Task 1: 新增 CI workflow

**Files:**
- Add: `.github/workflows/map-engine-checks.yml`

**Step 1: 写最小实现**
- 配置触发：`pull_request`、`push(main/master)`、`workflow_dispatch`
- 固定 `Node 20`，安装依赖，执行 `npm run test:map-engine`
- 配置 Chrome 环境变量 `CHROME_BIN`
- 上传 smoke 产物（`test-results/*.png|*.html|*.json`）

**Step 2: 本地可验证项**

Run: `npm run test:map-engine`
Expected: PASS

### Task 2: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 补充 CI workflow 与产物上传说明
- checkpoint 更新到 `v1.4` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
