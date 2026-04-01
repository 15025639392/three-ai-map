// Core Engine
export { GlobeEngine } from "./engine/GlobeEngine";
export type { GlobeEngineEvents } from "./engine/GlobeEngine";
export type {
  GlobeEngineOptions,
  GlobeEngineRecoveryPolicy,
  GlobeEngineRecoveryRule,
  EngineView
} from "./engine/EngineOptions";

// Layers
export { Layer } from "./layers/Layer";
export type {
  LayerErrorCategory,
  LayerErrorPayload,
  LayerRecoveryOverrides,
  LayerRecoveryQuery,
  LayerErrorSeverity,
  MarkerDefinition,
  PolylineDefinition,
  PolygonDefinition,
  PickResult
} from "./layers/Layer";
export { MarkerLayer } from "./layers/MarkerLayer";
export { PolylineLayer } from "./layers/PolylineLayer";
export { PolygonLayer } from "./layers/PolygonLayer";
export { TerrainTileLayer } from "./layers/TerrainTileLayer";
export type {
  TerrainTileLayerOptions,
  CoordTransformFn
} from "./layers/TerrainTileLayer";
export { RasterLayer } from "./layers/RasterLayer";
export type { RasterLayerOptions } from "./layers/RasterLayer";

// Advanced Layers
export { VectorTileLayer } from "./layers/VectorTileLayer";
export { ObliquePhotogrammetryLayer } from "./layers/ObliquePhotogrammetryLayer";
export type {
  ObliquePhotogrammetryNode,
  ObliquePhotogrammetryTileset,
  ObliquePhotogrammetryLayerOptions,
  ObliquePhotogrammetryDebugStats
} from "./layers/ObliquePhotogrammetryLayer";
export {
  convert3DTilesToObliquePhotogrammetryTileset
} from "./layers/ObliquePhotogrammetry3DTiles";
export type {
  ThreeDTilesBoundingVolume,
  ThreeDTilesContent,
  ThreeDTilesNode,
  ThreeDTilesTileset,
  ThreeDTilesToObliqueOptions
} from "./layers/ObliquePhotogrammetry3DTiles";
export { InstancedMarkerLayer } from "./layers/InstancedMarkerLayer";
export { ClusterLayer } from "./layers/ClusterLayer";
export { HeatmapLayer } from "./layers/HeatmapLayer";
export { CustomLayer } from "./layers/CustomLayer";

// Spatial
export { haversineDistance, greatCircleDistance } from "./spatial/Distance";
export { polygonArea } from "./spatial/Area";
export { pointInPolygon, distanceToLine, bearing } from "./spatial/Relation";
export {
  wgs84ToGcj02,
  gcj02ToWgs84,
  wgs84ToBd09,
  gcj02ToBd09,
  bd09ToGcj02
} from "./spatial/CoordinateTransform";

// Core Systems
export { AnimationManager } from "./core/Animation";
export type { Animation, AnimationOptions } from "./core/Animation";
export { GestureController } from "./core/GestureController";
export { PerformanceMonitor } from "./core/PerformanceMonitor";
export type { Metric, PerformanceReport } from "./core/PerformanceMonitor";
export { PostProcessing } from "./core/PostProcessing";
export type { SurfaceHost, SurfacePlannerConfig } from "./surface/SurfaceHost";

// Tile Infrastructure
export { defaultTileLoader, corsTileLoader, type TileSource } from "./tiles/tileLoader";
export type { LngLatBounds } from "./tiles/LngLatBounds";
export type { ElevationEncoding } from "./tiles/ElevationEncoding";

// Sources
export type { Source, SourceContext } from "./sources/Source";
export { RasterTileSource } from "./sources/RasterTileSource";
export type { RasterTileSourceOptions } from "./sources/RasterTileSource";
export { TerrainTileSource } from "./sources/TerrainTileSource";
export type { TerrainTileSourceOptions, ElevationTileData } from "./sources/TerrainTileSource";

// Spatial Index
export { SpatialIndex } from "./spatial/SpatialIndex";
