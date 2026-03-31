import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from "three";
import { cartesianToCartographic, cartographicToCartesian } from "../geo/projection";
import { clampLatitude, normalizeLongitude } from "../geo/ellipsoid";
import { TileCoordinate } from "./TileViewport";

export interface SurfaceTileSelectionOptions {
  camera: PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  radius: number;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

export type SurfaceTileInteractionPhase = "interacting" | "idle";
export type TileNodeWantedState = "parent" | "leaf";

export interface SurfaceTilePlannerOptions extends SurfaceTileSelectionOptions {
  interactionPhase?: SurfaceTileInteractionPhase;
}

export interface TileNodePlan {
  key: string;
  coordinate: TileCoordinate;
  parentKey: string | null;
  priority: number;
  wantedState: TileNodeWantedState;
  interactionPhase: SurfaceTileInteractionPhase;
  morphFactor: number;
}

export interface SurfaceTilePlan {
  targetZoom: number;
  centerCoordinate: TileCoordinate;
  interactionPhase: SurfaceTileInteractionPhase;
  nodes: TileNodePlan[];
}

interface TileMetrics {
  center: Vector3;
  sphereRadius: number;
  geometricError: number;
}

interface CandidateNode {
  coordinate: TileCoordinate;
  sse: number;
  priority: number;
}

interface CenterTileByZoom {
  x: number;
  y: number;
}

interface TileBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

const PRIORITY_BASELINE = 100_000;
const MIN_DISTANCE_EPSILON = 1e-6;
const HORIZON_EPSILON = 1e-6;
const IDLE_SSE_THRESHOLD = 1.0;
const INTERACTING_SSE_THRESHOLD = 2.2;
const IDLE_MAX_LEAF_NODES = 1024;
const INTERACTING_MAX_LEAF_NODES = 320;
const MAX_SPLIT_STEPS = 8192;

const FRUSTUM = new Frustum();
const FRUSTUM_MATRIX = new Matrix4();
const TILE_SPHERE = new Sphere();
const SAMPLE_SUM = new Vector3();
const SAMPLE_CARTESIAN = new Vector3();
const SUBPOINT_CARTESIAN = new Vector3();

export function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

export function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

export function getParentCoordinate(coordinate: TileCoordinate): TileCoordinate {
  return {
    z: Math.max(0, coordinate.z - 1),
    x: Math.floor(coordinate.x / 2),
    y: Math.floor(coordinate.y / 2)
  };
}

export function shortestWrappedTileDistance(x: number, centerX: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  const directDistance = Math.abs(x - centerX);
  return Math.min(directDistance, worldTileCount - directDistance);
}

function sortCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return coordinates.sort((left, right) => {
    if (left.z !== right.z) {
      return left.z - right.z;
    }
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });
}

export function uniqueSortedCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return sortCoordinates([...new Map(
    coordinates.map((coordinate) => [tileCoordinateKey(coordinate), coordinate])
  ).values()]);
}

function mercatorToLatitude(normalizedY: number): number {
  const mercator = Math.PI * (1 - 2 * normalizedY);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function getTileBounds(coordinate: TileCoordinate): TileBounds {
  const worldTileCount = 2 ** coordinate.z;
  const west = (coordinate.x / worldTileCount) * 360 - 180;
  const east = ((coordinate.x + 1) / worldTileCount) * 360 - 180;
  const north = mercatorToLatitude(coordinate.y / worldTileCount);
  const south = mercatorToLatitude((coordinate.y + 1) / worldTileCount);

  return { west, east, south, north };
}

function lngToTileX(lng: number, zoom: number): number {
  return ((normalizeLongitude(lng) + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = (clamped * Math.PI) / 180;
  return (
    (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * 2 ** zoom
  );
}

function toTileCoordinate(lng: number, lat: number, zoom: number): TileCoordinate {
  const worldTileCount = 2 ** zoom;
  const x = normalizeTileX(Math.floor(lngToTileX(lng, zoom)), zoom);
  const y = Math.max(0, Math.min(worldTileCount - 1, Math.floor(latToTileY(lat, zoom))));
  return { z: zoom, x, y };
}

function getChildCoordinates(coordinate: TileCoordinate): TileCoordinate[] {
  const childZoom = coordinate.z + 1;
  const baseX = coordinate.x * 2;
  const baseY = coordinate.y * 2;

  return [
    { z: childZoom, x: normalizeTileX(baseX, childZoom), y: baseY },
    { z: childZoom, x: normalizeTileX(baseX + 1, childZoom), y: baseY },
    { z: childZoom, x: normalizeTileX(baseX, childZoom), y: baseY + 1 },
    { z: childZoom, x: normalizeTileX(baseX + 1, childZoom), y: baseY + 1 }
  ];
}

function buildTileMetrics(
  coordinate: TileCoordinate,
  radius: number,
  tileSize: number
): TileMetrics {
  const bounds = getTileBounds(coordinate);
  const points: Vector3[] = [];

  for (const latT of [0, 0.5, 1]) {
    const lat = bounds.south + (bounds.north - bounds.south) * latT;

    for (const lngT of [0, 0.5, 1]) {
      const lng = bounds.west + (bounds.east - bounds.west) * lngT;
      const cartesian = cartographicToCartesian({ lng, lat, height: 0 }, radius);
      points.push(new Vector3(cartesian.x, cartesian.y, cartesian.z));
    }
  }

  SAMPLE_SUM.set(0, 0, 0);
  for (const point of points) {
    SAMPLE_SUM.add(point);
  }

  if (SAMPLE_SUM.lengthSq() <= MIN_DISTANCE_EPSILON) {
    SAMPLE_CARTESIAN.copy(points[0]);
  } else {
    SAMPLE_CARTESIAN.copy(SAMPLE_SUM).normalize().multiplyScalar(radius);
  }

  let sphereRadius = 0;

  for (const point of points) {
    sphereRadius = Math.max(sphereRadius, point.distanceTo(SAMPLE_CARTESIAN));
  }

  const geometricError = (sphereRadius * 2) / Math.max(1, tileSize);

  return {
    center: SAMPLE_CARTESIAN.clone(),
    sphereRadius,
    geometricError
  };
}

function computeNodePriority(
  coordinate: TileCoordinate,
  centerByZoom: ReadonlyMap<number, CenterTileByZoom>
): number {
  const center = centerByZoom.get(coordinate.z);

  if (!center) {
    return PRIORITY_BASELINE;
  }

  const dx = shortestWrappedTileDistance(coordinate.x, center.x, coordinate.z);
  const dy = Math.abs(coordinate.y - center.y);
  const distancePenalty = dx * dx + dy * dy;
  return PRIORITY_BASELINE - distancePenalty;
}

function getSseThreshold(interactionPhase: SurfaceTileInteractionPhase): number {
  return interactionPhase === "idle" ? IDLE_SSE_THRESHOLD : INTERACTING_SSE_THRESHOLD;
}

function getLeafBudget(interactionPhase: SurfaceTileInteractionPhase): number {
  return interactionPhase === "idle" ? IDLE_MAX_LEAF_NODES : INTERACTING_MAX_LEAF_NODES;
}

function evaluateNode(
  coordinate: TileCoordinate,
  radius: number,
  tileSize: number,
  cameraPosition: Vector3,
  cameraDistance: number,
  projectionScale: number,
  tileMetricsCache: Map<string, TileMetrics>
): { visible: boolean; sse: number } {
  const key = tileCoordinateKey(coordinate);
  let metrics = tileMetricsCache.get(key);

  if (!metrics) {
    metrics = buildTileMetrics(coordinate, radius, tileSize);
    tileMetricsCache.set(key, metrics);
  }

  TILE_SPHERE.center.copy(metrics.center);
  TILE_SPHERE.radius = metrics.sphereRadius;

  if (!FRUSTUM.intersectsSphere(TILE_SPHERE)) {
    return { visible: false, sse: 0 };
  }

  const horizonTest = cameraPosition.dot(metrics.center) + cameraDistance * metrics.sphereRadius;

  if (horizonTest < radius * radius - HORIZON_EPSILON) {
    return { visible: false, sse: 0 };
  }

  const distanceToSurface = Math.max(
    MIN_DISTANCE_EPSILON,
    cameraPosition.distanceTo(metrics.center) - metrics.sphereRadius
  );
  const sse = (metrics.geometricError * projectionScale) / distanceToSurface;

  return {
    visible: true,
    sse
  };
}

function buildCenterTileByZoom(
  cameraPosition: Vector3,
  radius: number,
  minZoom: number,
  maxZoom: number
): Map<number, CenterTileByZoom> {
  SUBPOINT_CARTESIAN.copy(cameraPosition).normalize().multiplyScalar(radius);
  const subpoint = cartesianToCartographic(
    {
      x: SUBPOINT_CARTESIAN.x,
      y: SUBPOINT_CARTESIAN.y,
      z: SUBPOINT_CARTESIAN.z
    },
    radius
  );
  const byZoom = new Map<number, CenterTileByZoom>();

  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const coordinate = toTileCoordinate(subpoint.lng, clampLatitude(subpoint.lat), zoom);
    byZoom.set(zoom, { x: coordinate.x, y: coordinate.y });
  }

  return byZoom;
}

function selectLeafCoordinates(options: SurfaceTileSelectionOptions, interactionPhase: SurfaceTileInteractionPhase): TileCoordinate[] {
  FRUSTUM_MATRIX.multiplyMatrices(options.camera.projectionMatrix, options.camera.matrixWorldInverse);
  FRUSTUM.setFromProjectionMatrix(FRUSTUM_MATRIX);

  const cameraPosition = options.camera.position.clone();
  const cameraDistance = Math.max(MIN_DISTANCE_EPSILON, cameraPosition.length());
  const projectionScale = options.viewportHeight / (2 * Math.tan((options.camera.fov * Math.PI) / 360));
  const sseThreshold = getSseThreshold(interactionPhase);
  const leafBudget = getLeafBudget(interactionPhase);
  const tileMetricsCache = new Map<string, TileMetrics>();
  const centerByZoom = buildCenterTileByZoom(
    cameraPosition,
    options.radius,
    options.minZoom,
    options.maxZoom
  );
  const leaves = new Map<string, TileCoordinate>();
  const candidates: CandidateNode[] = [];

  const minWorldTileCount = 2 ** options.minZoom;

  for (let y = 0; y < minWorldTileCount; y += 1) {
    for (let x = 0; x < minWorldTileCount; x += 1) {
      const coordinate = { z: options.minZoom, x, y };
      const evaluation = evaluateNode(
        coordinate,
        options.radius,
        options.tileSize,
        cameraPosition,
        cameraDistance,
        projectionScale,
        tileMetricsCache
      );

      if (!evaluation.visible) {
        continue;
      }

      const key = tileCoordinateKey(coordinate);
      leaves.set(key, coordinate);

      if (coordinate.z < options.maxZoom && evaluation.sse > sseThreshold) {
        candidates.push({
          coordinate,
          sse: evaluation.sse,
          priority: computeNodePriority(coordinate, centerByZoom)
        });
      }
    }
  }

  if (leaves.size === 0) {
    const fallbackCenter = centerByZoom.get(options.minZoom) ?? { x: 0, y: 0 };
    const fallbackCoordinate = {
      z: options.minZoom,
      x: normalizeTileX(fallbackCenter.x, options.minZoom),
      y: Math.max(0, Math.min(minWorldTileCount - 1, fallbackCenter.y))
    };
    leaves.set(tileCoordinateKey(fallbackCoordinate), fallbackCoordinate);
  }

  let splitSteps = 0;

  while (candidates.length > 0 && splitSteps < MAX_SPLIT_STEPS) {
    candidates.sort((left, right) => {
      if (left.sse !== right.sse) {
        return right.sse - left.sse;
      }

      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return tileCoordinateKey(left.coordinate).localeCompare(tileCoordinateKey(right.coordinate));
    });

    const candidate = candidates.shift();

    if (!candidate) {
      break;
    }

    const parent = candidate.coordinate;

    if (parent.z >= options.maxZoom) {
      continue;
    }

    const parentKey = tileCoordinateKey(parent);

    if (!leaves.has(parentKey)) {
      continue;
    }

    if (leaves.size + 3 > leafBudget) {
      continue;
    }

    const parentEvaluation = evaluateNode(
      parent,
      options.radius,
      options.tileSize,
      cameraPosition,
      cameraDistance,
      projectionScale,
      tileMetricsCache
    );

    if (!parentEvaluation.visible || parentEvaluation.sse <= sseThreshold) {
      continue;
    }

    const visibleChildren: Array<{ coordinate: TileCoordinate; sse: number }> = [];

    for (const child of getChildCoordinates(parent)) {
      const evaluation = evaluateNode(
        child,
        options.radius,
        options.tileSize,
        cameraPosition,
        cameraDistance,
        projectionScale,
        tileMetricsCache
      );

      if (!evaluation.visible) {
        continue;
      }

      visibleChildren.push({ coordinate: child, sse: evaluation.sse });
    }

    if (visibleChildren.length === 0) {
      continue;
    }

    leaves.delete(parentKey);

    for (const child of visibleChildren) {
      const childKey = tileCoordinateKey(child.coordinate);
      leaves.set(childKey, child.coordinate);

      if (child.coordinate.z < options.maxZoom && child.sse > sseThreshold) {
        candidates.push({
          coordinate: child.coordinate,
          sse: child.sse,
          priority: computeNodePriority(child.coordinate, centerByZoom)
        });
      }
    }

    splitSteps += 1;
  }

  return uniqueSortedCoordinates([...leaves.values()]);
}

export function planSurfaceTileNodes(options: SurfaceTilePlannerOptions): SurfaceTilePlan {
  const interactionPhase = options.interactionPhase ?? "idle";
  const coordinates = selectLeafCoordinates(options, interactionPhase);
  const targetZoom = coordinates.reduce(
    (maxZoom, coordinate) => Math.max(maxZoom, coordinate.z),
    options.minZoom
  );
  const centerByZoom = buildCenterTileByZoom(
    options.camera.position,
    options.radius,
    options.minZoom,
    Math.max(options.maxZoom, targetZoom)
  );
  const center = centerByZoom.get(targetZoom) ?? centerByZoom.get(options.minZoom) ?? { x: 0, y: 0 };
  const centerCoordinate: TileCoordinate = {
    z: targetZoom,
    x: normalizeTileX(center.x, targetZoom),
    y: Math.max(0, Math.min(2 ** targetZoom - 1, center.y))
  };
  const nodes = [...coordinates]
    .map((coordinate) => ({
      key: tileCoordinateKey(coordinate),
      coordinate,
      parentKey: coordinate.z === 0 ? null : tileCoordinateKey(getParentCoordinate(coordinate)),
      priority: computeNodePriority(coordinate, centerByZoom),
      wantedState: "leaf" as const,
      interactionPhase,
      morphFactor: 1
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return left.key.localeCompare(right.key);
    });

  return {
    targetZoom,
    centerCoordinate,
    interactionPhase,
    nodes
  };
}
