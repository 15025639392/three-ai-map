import { Object3D, PerspectiveCamera, Raycaster, type WebGLRenderer } from "three";
import { Cartesian3Like, Cartographic } from "../geo/cartographic";
import type { Source } from "../sources/Source";
import type { SurfaceTilePlan } from "../tiles/SurfaceTilePlanner";
import type { TerrainTileHost } from "./TerrainTileHost";

export interface LayerErrorPayload {
  source: "layer";
  layerId: string;
  stage: string;
  category: LayerErrorCategory;
  severity: LayerErrorSeverity;
  error: unknown;
  recoverable: boolean;
  tileKey?: string;
  metadata?: Record<string, unknown>;
}

export type LayerErrorCategory =
  | "network"
  | "data"
  | "render"
  | "unknown";

export type LayerErrorSeverity =
  | "warn"
  | "error"
  | "fatal";

export interface LayerRecoveryQuery {
  layerId: string;
  stage: string;
  category: LayerErrorCategory;
  severity: LayerErrorSeverity;
}

export interface LayerRecoveryOverrides {
  imageryRetryAttempts?: number;
  imageryRetryDelayMs?: number;
  imageryFallbackColor?: string | null;
  elevationRetryAttempts?: number;
  elevationRetryDelayMs?: number;
  vectorParseRetryAttempts?: number;
  vectorParseRetryDelayMs?: number;
  vectorParseFallbackToEmpty?: boolean;
}

export interface LayerContext {
  scene: Object3D;
  camera: PerspectiveCamera;
  radius: number;
  rendererElement?: HTMLCanvasElement;
  getRenderer?: () => WebGLRenderer | null;
  requestRender?: () => void;
  reportError?: (payload: LayerErrorPayload) => void;
  resolveRecovery?: (query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined;
  getSource?: (id: string) => Source | undefined;
  getTerrainHost?: () => TerrainTileHost | null;
  getSurfaceTilePlan?: () => SurfaceTilePlan;
}

export interface MarkerDefinition {
  id: string;
  lng: number;
  lat: number;
  altitude: number;
  color?: string;
  size?: number;
}

export interface OverlayCoordinate {
  lng: number;
  lat: number;
  altitude: number;
}

export interface PolylineDefinition {
  id: string;
  coordinates: OverlayCoordinate[];
  color?: string;
  width?: number;
}

export interface PolygonDefinition {
  id: string;
  coordinates: OverlayCoordinate[];
  fillColor?: string;
  opacity?: number;
}

export interface MarkerPickResult {
  type: "marker";
  layerId: string;
  point: Cartesian3Like;
  marker: MarkerDefinition;
}

export interface PolylinePickResult {
  type: "polyline";
  layerId: string;
  point: Cartesian3Like;
  polyline: PolylineDefinition;
}

export interface PolygonPickResult {
  type: "polygon";
  layerId: string;
  point: Cartesian3Like;
  polygon: PolygonDefinition;
}

export interface GlobePickResult {
  type: "globe";
  point: Cartesian3Like;
  cartographic: Cartographic;
}

export interface VectorFeaturePickResult {
  type: "vector-feature";
  layerId: string;
  point: Cartesian3Like;
  feature: {
    type: "point" | "line" | "polygon";
    layer: string;
    geometry: number[][][];
    properties?: Record<string, unknown>;
  };
}

export interface ObliquePhotogrammetryNodePickResult {
  type: "oblique-photogrammetry-node";
  layerId: string;
  point: Cartesian3Like;
  node: {
    id: string;
    depth: number;
    geometricError: number;
    properties?: Record<string, unknown>;
  };
}

export type PickResult =
  | MarkerPickResult
  | PolylinePickResult
  | PolygonPickResult
  | VectorFeaturePickResult
  | ObliquePhotogrammetryNodePickResult
  | GlobePickResult;

export abstract class Layer {
  readonly id: string;
  visible = true;
  zIndex: number | undefined = undefined;
  addOrder = 0;

  constructor(id: string) {
    this.id = id;
  }

  onAdd(_context: LayerContext): void {}

  onRemove(_context: LayerContext): void {}

  update(_deltaTime: number, _context: LayerContext): void {}

  pick(_raycaster: Raycaster, _context: LayerContext): PickResult | null {
    return null;
  }

  protected emitLayerError(
    context: LayerContext | null,
    payload: Omit<LayerErrorPayload, "source" | "layerId">
  ): void {
    context?.reportError?.({
      source: "layer",
      layerId: this.id,
      ...payload
    });
  }

  dispose(): void {}
}
