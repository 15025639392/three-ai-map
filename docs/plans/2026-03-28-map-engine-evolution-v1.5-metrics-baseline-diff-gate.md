# Three-Map v1.5 指标基线漂移门禁实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v1.4` CI 门禁基础上，新增 metrics baseline diff 断言，避免恢复与性能指标退化被测试绿灯掩盖。

**Architecture:** 增加 `assert-map-engine-metrics-baseline.mjs`，读取 smoke 产物 `surface-tile-zoom-regression-metrics.json` 与 `surface-tile-recovery-stages-regression-metrics.json`，执行阈值区间断言；把脚本接入 `test:map-engine`。

**Tech Stack:** `node`, `bash`

---

### Task 1: 实现 baseline diff 断言脚本

**Files:**
- Add: `scripts/assert-map-engine-metrics-baseline.mjs`
- Modify: `package.json`
- Modify: `scripts/run-map-engine-checks.sh`

**Step 1: 写最小实现**
- 为 zoom 与 stage recovery 指标定义可容忍区间
- 脚本统一输出失败清单与通过日志
- 接入 `test:metrics:baseline` 并串到 `test:map-engine`

**Step 2: 运行目标验证**

Run: `npm run test:map-engine`
Expected: PASS

### Task 2: 文档与断点收口

**Files:**
- Modify: `README.md`
- Modify: `docs/performance/2026-03-28-surface-tile-baseline.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新说明**
- README 增加 `test:metrics:baseline` 与门禁说明
- performance 文档补充 baseline diff 门禁口径
- checkpoint 更新到 `v1.5` 并给出下一步唯一动作

**Step 2: 运行统一质量入口**

Run: `npm run test:map-engine`
Expected: PASS
