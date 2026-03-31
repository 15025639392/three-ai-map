
1) 地形数据表达层

- 现在：Raster DEM(Terrarium) 解码后再按固定网格重建 mesh，meshSegments 固定。
  TerrainTileLayer.ts:264
  TerrainTileLayer.ts:541
  TerrariumDecoder.ts:46
- 正规：通常直接用分层地形 mesh（如 quantized-mesh），每瓦片自带几何误差与可用性元数据，顶点密度按地形复杂度变化。

2) LOD 判定模型

- 现在：SSE 基于“瓦片包围近似 + 固定阈值 + 固定叶子预算”。
  SurfaceTilePlanner.ts:67
  SurfaceTilePlanner.ts:236
  SurfaceTilePlanner.ts:397
- 正规：更依赖每 tile 的层级几何误差元数据，遍历时有更严格的一致性约束（frontier 连续性、邻接约束、hysteresis）。

3) 裂缝与过渡

- 现在：靠 skirt + parent fallback + CPU geomorph（每帧改顶点并重算法线）。
  TerrainTileLayer.ts:161
  TerrainTileLayer.ts:780
  TerrainTileLayer.ts:912
- 正规：通常有更严格的邻接 LOD 裂缝规则，过渡更多在 GPU/批处理路径做，CPU 改 mesh 的成本更低。

4) 极区覆盖策略

- 现在：WebMercator 本身不到极点，靠 RasterLayer 手工补极区帽。
  RasterLayer.ts:292
  RasterLayer.ts:1401
- 正规：一般是数据源/切片体系层面解决极区，不依赖渲染层临时补片。

5) 请求调度

- 现在：通用优先队列 + 并发上限 + 取消/去重，策略相对轻量。
  TileScheduler.ts:59
  TileScheduler.ts:193
- 正规：通常是多级预算、帧时预算、网络状态自适应、预取环与内存预算联动。