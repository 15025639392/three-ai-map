// Core Engine
export { GlobeEngine } from "./engine/GlobeEngine";
export type { GlobeEngineEvents } from "./engine/GlobeEngine";
export type { EngineModule } from "./engine/EngineModule";
export type {
  GlobeEngineOptions,
  GlobeEngineRecoveryPolicy,
  GlobeEngineRecoveryRule,
  EngineView
} from "./engine/EngineOptions";
export { CameraController } from "./camera/CameraController";
export type { CameraViewUpdate } from "./camera/CameraController";
export { RendererSystem } from "./scene/RendererSystem";
export type { RendererSystemOptions } from "./scene/RendererSystem";
export { GlobeMesh, createGlobeMesh } from "./scene/GlobeMesh";

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
export { CoordinateSystem } from "./geo/CoordinateSystem";
export type { Cartesian3 } from "./geo/CoordinateSystem";
export { Ellipsoid, WGS84_ELLIPSOID, WGS84_RADIUS } from "./geo/ellipsoid";
export { createEastNorthUpAxes } from "./geo/ENU";
export type { ENUAxes } from "./geo/ENU";

// Core Systems
export { AnimationManager } from "./core/Animation";
export type { Animation, AnimationOptions } from "./core/Animation";
export { EventBus } from "./core/EventBus";
export { GestureController } from "./core/GestureController";
export { FrameLoop } from "./core/FrameLoop";
export { ModuleRegistry } from "./core/ModuleRegistry";
export { RequestScheduler } from "./core/RequestScheduler";
export type {
  RequestSchedulerOptions,
  ScheduledRequest
} from "./core/RequestScheduler";
export { PostProcessing } from "./core/PostProcessing";
export { TileCache } from "./core/TileCache";
export { PerformanceMonitor } from "./diagnostics/PerformanceMonitor";
export type {
  Metric,
  PerformanceMetrics,
  PerformanceReport
} from "./diagnostics/PerformanceMonitor";
export type { DebugState } from "./diagnostics/DebugState";
export type { SurfaceHost, SurfacePlannerConfig } from "./surface/SurfaceHost";

// Tile Infrastructure
export { defaultTileLoader, corsTileLoader, type TileSource } from "./tiles/tileLoader";
export type { LngLatBounds } from "./tiles/LngLatBounds";
export type { ElevationEncoding } from "./tiles/ElevationEncoding";
export { QuadtreeLOD } from "./tiles/QuadtreeLOD";
export type {
  QuadtreeLODOptions,
  ScreenSpaceErrorInput
} from "./tiles/QuadtreeLOD";
export { parseTileKey, tileKey } from "./tiles/TileKey";

// Sources
export type { Source, SourceContext } from "./sources/Source";
export { RasterTileSource } from "./sources/RasterTileSource";
export type { RasterTileSourceOptions } from "./sources/RasterTileSource";
export { TerrainTileSource } from "./sources/TerrainTileSource";
export type { TerrainTileSourceOptions, ElevationTileData } from "./sources/TerrainTileSource";

// Spatial Index
export { SpatialIndex } from "./spatial/SpatialIndex";
