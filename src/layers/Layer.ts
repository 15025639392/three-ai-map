import { PerspectiveCamera, Raycaster, Scene } from "three";
import { Cartesian3Like, Cartographic } from "../geo/cartographic";
import { GlobeMesh } from "../globe/GlobeMesh";

export interface LayerContext {
  scene: Scene;
  camera: PerspectiveCamera;
  globe: GlobeMesh;
  radius: number;
  rendererElement?: HTMLCanvasElement;
  requestRender?: () => void;
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

export type PickResult =
  | MarkerPickResult
  | PolylinePickResult
  | PolygonPickResult
  | GlobePickResult;

export abstract class Layer {
  readonly id: string;
  visible = true;
  zIndex = 0;

  constructor(id: string) {
    this.id = id;
  }

  onAdd(_context: LayerContext): void {}

  onRemove(_context: LayerContext): void {}

  update(_deltaTime: number, _context: LayerContext): void {}

  pick(_raycaster: Raycaster, _context: LayerContext): PickResult | null {
    return null;
  }

  dispose(): void {}
}
