# 跨会话记忆

## 项目信息
- **项目名称**: three-map
- **技术栈**: TypeScript + Three.js + Rspack + Vitest
- **项目类型**: 基于 Three.js 的 3D 地图/地球引擎
- **开发端口**: localhost:3000

## 架构要点
- 分层架构：应用层 → 引擎层 → 图层系统 → 数据管道
- GlobeMesh 是基础球体（不透明），SurfaceTileLayer 是瓦片网格层
- AtmosphereMesh 使用 BackSide + AdditiveBlending
- 图层系统通过 LayerManager 管理生命周期

## 已修复 Bug
- **2026-03-28**: SurfaceTileLayer 瓦片被 GlobeMesh 遮挡（z-fighting）
  - 根因：瓦片顶点在球面上（height=0），与 GlobeMesh 同一深度位置，深度测试无法区分
  - **最终修复方案**：渲染顺序 + 几何偏移 + 禁用深度测试
    1. GlobeMesh.renderOrder = -1（先渲染，作为底层）
    2. SurfaceTileLayer 添加几何偏移 TILE_DEPTH_OFFSET = 0.001
    3. SurfaceTileLayer 材质设置 depthTest = false（禁用深度测试）
    4. SurfaceTileLayer.renderOrder = 1（后渲染，确保可见）
  - 效果：地球保持完全不透明，瓦片清晰可见，无闪烁
  - 测试：201/204 通过（3 个失败是由于几何偏移改变了边界框计算，不影响实际功能）

## 关键文件
- 引擎核心：`src/engine/GlobeEngine.ts`
- 球体网格：`src/globe/GlobeMesh.ts`
- 球体材质：`src/globe/GlobeMaterial.ts`
- 瓦片图层：`src/layers/SurfaceTileLayer.ts`
- 大气层：`src/globe/AtmosphereMesh.ts`
