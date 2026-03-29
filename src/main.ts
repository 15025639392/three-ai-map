import "./styles.css";

const DEMOS = [
  {
    name: "basic-globe",
    title: "基础地球",
    description: "完整地球演示：瓦片影像、高程、点标记、折线、多边形与相机巡游",
    tags: ["OSM", "elevation", "markers", "polylines", "polygons"],
  },
  {
    name: "basic-globe-performance-regression",
    title: "基础地球性能回归",
    description: "确定性回归：基础地球式平移/缩放性能与瓦片请求稳定性",
    tags: ["regression", "performance", "surface-tiles", "browser-smoke"],
  },
  {
    name: "basic-globe-load-profile-regression",
    title: "基础地球加载剖析回归",
    description: "确定性回归：基线/压力加载剖析与性能劣化比例",
    tags: ["regression", "performance", "load-profile", "browser-smoke"],
  },
  {
    name: "basic-globe-load-ladder-regression",
    title: "基础地球加载阶梯回归",
    description: "确定性回归：基线/中等/重载阶梯与剖析单调性约束",
    tags: ["regression", "performance", "load-ladder", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-regression",
    title: "基础地球加载恢复回归",
    description: "确定性回归：重载叠加清理与场景/图层恢复约束",
    tags: ["regression", "performance", "load-recovery", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-stress-regression",
    title: "基础地球加载恢复压力回归",
    description: "确定性回归：多轮重载清理与恢复稳定性约束",
    tags: ["regression", "performance", "load-recovery-stress", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-endurance-regression",
    title: "基础地球加载恢复耐久回归",
    description: "确定性回归：长时间重载/恢复交互压力与恢复稳定性约束",
    tags: ["regression", "performance", "load-recovery-endurance", "browser-smoke"],
  },
  {
    name: "basic-globe-load-recovery-drift-regression",
    title: "基础地球加载恢复漂移回归",
    description: "确定性回归：多轮重载/恢复漂移约束（恢复一致性）",
    tags: ["regression", "performance", "load-recovery-drift", "browser-smoke"],
  },
  {
    name: "oblique-photogrammetry-regression",
    title: "倾斜摄影回归",
    description: "确定性回归：倾斜摄影 tileset 可见性与拾取稳定性",
    tags: ["regression", "oblique-photogrammetry", "3d-tiles", "browser-smoke"],
  },
  {
    name: "gaode-satellite",
    title: "高德卫星",
    description: "高德（Amap）卫星影像，带 GCJ-02 坐标变换与高程",
    tags: ["Gaode", "GCJ-02", "satellite", "elevation"],
  },
  {
    name: "gaode-satellite-labels",
    title: "高德卫星 + 标注",
    description: "高德卫星底图 + 道路/标注叠加（同一地形 host 上双 RasterLayer）",
    tags: ["Gaode", "GCJ-02", "satellite", "labels"],
  },
  {
    name: "baidu-satellite",
    title: "百度卫星",
    description: "百度卫星影像，带 BD-09 坐标变换与高程",
    tags: ["Baidu", "BD-09", "satellite", "elevation"],
  },
  {
    name: "baidu-road",
    title: "百度道路",
    description: "百度道路底图（中文标注），带 BD-09 坐标变换",
    tags: ["Baidu", "BD-09", "road"],
  },
  {
    name: "surface-tile-regression",
    title: "地形瓦片回归",
    description: "确定性回归：TerrainTileLayer 在相机不动时的选瓦片更新",
    tags: ["regression", "terrain-tiles", "browser-smoke"],
  },
  {
    name: "surface-tile-resize-regression",
    title: "地形瓦片尺寸回归",
    description: "确定性回归：视口尺寸变化与瓦片重选",
    tags: ["regression", "terrain-tiles", "resize", "browser-smoke"],
  },
  {
    name: "surface-tile-zoom-regression",
    title: "地形瓦片缩放回归",
    description: "确定性回归：相机缩放、请求取消与性能指标",
    tags: ["regression", "terrain-tiles", "zoom", "performance"],
  },
  {
    name: "surface-tile-recovery-stages-regression",
    title: "地形瓦片恢复阶段回归",
    description: "确定性回归：tile-load/tile-parse 恢复策略指标",
    tags: ["regression", "surface-tiles", "recovery-policy", "browser-smoke"],
  },
  {
    name: "surface-tile-coord-transform-regression",
    title: "地形瓦片坐标变换回归",
    description: "确定性回归：TerrainTileLayer `coordTransform` 几何一致性",
    tags: ["regression", "terrain-tiles", "coord-transform", "browser-smoke"],
  },
  {
    name: "surface-tile-lifecycle-regression",
    title: "地形瓦片生命周期回归",
    description: "确定性回归：TerrainTileLayer 添加/移除/重新添加 生命周期一致性",
    tags: ["regression", "terrain-tiles", "lifecycle", "browser-smoke"],
  },
  {
    name: "surface-tile-lifecycle-stress-regression",
    title: "地形瓦片生命周期压力回归",
    description: "确定性回归：TerrainTile 生命周期多轮压力一致性",
    tags: ["regression", "terrain-tiles", "lifecycle", "stress", "browser-smoke"],
  },
  {
    name: "vector-tile-regression",
    title: "矢量瓦片回归",
    description: "确定性回归：VectorTile 点/线/面 渲染",
    tags: ["regression", "vector-tiles", "mvt", "browser-smoke"],
  },
  {
    name: "projection-regression",
    title: "投影回归",
    description: "确定性回归：GCJ/BD 坐标变换往返精度",
    tags: ["regression", "projection", "gcj02", "bd09"],
  },
  {
    name: "terrarium-decode-regression",
    title: "Terrarium 解码回归",
    description: "确定性回归：Terrarium 解码 worker 命中率与回退指标",
    tags: ["regression", "terrarium", "worker", "browser-smoke"],
  },
  {
    name: "vector-pick-regression",
    title: "矢量拾取回归",
    description: "确定性回归：VectorTile 浏览器端拾取精度",
    tags: ["regression", "vector-tiles", "pick", "browser-smoke"],
  },
  {
    name: "vector-geometry-pick-regression",
    title: "矢量几何拾取回归",
    description: "确定性回归：VectorTile 点/线/面 拾取精度",
    tags: ["regression", "vector-tiles", "pick", "geometry", "browser-smoke"],
  },
  {
    name: "vector-multi-tile-pick-regression",
    title: "矢量多瓦片拾取回归",
    description: "确定性回归：VectorTile 跨瓦片边界拾取稳定性",
    tags: ["regression", "vector-tiles", "pick", "multi-tile", "browser-smoke"],
  },
  {
    name: "vector-overlap-pick-regression",
    title: "矢量重叠拾取回归",
    description: "确定性回归：VectorTile 重叠拾取优先级（zIndex + depth）",
    tags: ["regression", "vector-tiles", "pick", "overlap", "browser-smoke"],
  },
  {
    name: "vector-layer-zindex-pick-regression",
    title: "矢量层级 ZIndex 拾取回归",
    description: "确定性回归：跨图层 VectorTile 拾取优先级（layer.zIndex）",
    tags: ["regression", "vector-tiles", "pick", "zindex", "browser-smoke"],
  },
];

export function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  const demoCards = DEMOS.map(
    (d) => `
    <a class="demo-card" href="/${d.name}.html">
      <div class="demo-card-header">
        <h2>${d.title}</h2>
        <span class="demo-arrow">&rarr;</span>
      </div>
      <p class="demo-card-desc">${d.description}</p>
      <div class="demo-card-tags">${d.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    </a>`
  ).join("");

  app.innerHTML = `
    <main class="index-shell">
      <header class="index-header">
        <p class="eyebrow">Three-Map</p>
        <h1>演示</h1>
        <p class="index-subtitle">
          基于 Three.js 的 3D 地球引擎 &mdash; 支持瓦片影像、高程、点标记、折线、多边形、坐标变换等。
        </p>
      </header>
      <div class="demo-grid">${demoCards}</div>
    </main>
  `;
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  render();
}
