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
export { ImageryLayer } from "./layers/ImageryLayer";

// Tile Layers
export { ElevationLayer } from "./layers/ElevationLayer";
export { SurfaceTileLayer } from "./layers/SurfaceTileLayer";
export type { CoordTransformFn, SurfaceTileLayerOptions } from "./layers/SurfaceTileLayer";

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

// Projection
export { Projection, ProjectionType } from "./projection/Projection";

// Core Systems
export { AnimationManager } from "./core/Animation";
export type { Animation, AnimationOptions } from "./core/Animation";
export { GestureController } from "./core/GestureController";
export { PerformanceMonitor } from "./core/PerformanceMonitor";
export type { Metric, PerformanceReport } from "./core/PerformanceMonitor";
export { PostProcessing } from "./core/PostProcessing";

// Tile Infrastructure
export { defaultTileLoader, corsTileLoader, type TileSource } from "./tiles/tileLoader";
export { FrustumCuller } from "./tiles/FrustumCuller";

// Spatial Index
export { SpatialIndex } from "./spatial/SpatialIndex";
