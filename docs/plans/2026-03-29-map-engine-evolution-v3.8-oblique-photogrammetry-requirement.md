# Three-Map v3.8 倾斜摄影（Oblique Photogrammetry）需求落盘计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `v3.7` 回归门禁收口后，将倾斜摄影能力纳入下一阶段可执行范围，明确首期格式选型、实现边界、回归门禁与验收路径，避免“目标存在但无法实施”。

**Architecture:** 首期以 `3D Tiles` 作为默认接入格式，形成 `tileset adapter -> node scheduling/culling -> render/pick -> browser smoke + baseline` 闭环；通过 deterministic demo 输出 `visibleNodeCount`、`lod/SSE proxy`、`pickHitType`、`frameDrops` 指标并接入 `test:map-engine`。

**Tech Stack:** `TypeScript`, `three.js`, `node`, `vitest`

---

### Task 1: 倾斜摄影接口与范围冻结

**Files:**
- Modify: `docs/plans/2026-03-28-map-engine-evolution-requirement.md`
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 写最小实现**
- 明确首期仅覆盖单 tileset 加载、基础可见性裁剪、拾取与门禁输出
- 明确非目标（不做 OSGB 全流程生产化、在线编辑、资产平台）
- 明确待确认项（格式、数据版权、数据规模）

**Step 2: 运行验证**

Run: `rg -n "倾斜摄影|Oblique|3D Tiles|T7|A7" docs/plans/2026-03-28-map-engine-evolution-requirement.md docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`  
Expected: 关键条目可检索且语义一致

### Task 2: 落地 v3.8 可执行任务骨架

**Files:**
- Add: `docs/plans/2026-03-29-map-engine-evolution-v3.8-oblique-photogrammetry-requirement.md`

**Step 1: 写最小实现**
- 定义后续实施任务批次：接口层、demo 回归层、baseline 层
- 每个任务给出文件范围、依赖与验收命令

**Step 2: 运行验证**

Run: `test -f docs/plans/2026-03-29-map-engine-evolution-v3.8-oblique-photogrammetry-requirement.md`  
Expected: PASS

### Task 3: 进入实现前门禁

**Files:**
- Modify: `docs/checkpoints/2026-03-28-map-engine-evolution-requirement.md`

**Step 1: 更新状态**
- 标注 `v3.8` 为“需求已落盘、待实现”
- 将续跑提示词切换到“直接进入 v3.8 实施”

**Step 2: 运行统一质量入口（可选）**

Run: `npm run test:map-engine`  
Expected: PASS
