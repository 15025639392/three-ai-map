import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from "three";
import { cartesianToCartographic, cartographicToCartesian } from "../geo/projection";
import { clampLatitude, normalizeLongitude } from "../geo/ellipsoid";
import { TileCoordinate } from "./TileViewport";

export interface SurfaceTileSelectionOptions {
  camera: PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  radius: number;
  meshMaxSegments: number;
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
}

interface NodeEvaluation {
  visible: boolean;
  sse: number;
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
const IDLE_SSE_THRESHOLD = 1.25;
const INTERACTING_SSE_THRESHOLD = 3.2;
const TILE_BUDGET_PIXEL_AREA = 18_000;
const IDLE_FRONTIER_SCALE = 3.2;
const INTERACTING_FRONTIER_SCALE = 2.2;
const MIN_IDLE_FRONTIER_NODES = 128;
const MAX_IDLE_FRONTIER_NODES = 1_536;
const MIN_INTERACTING_FRONTIER_NODES = 96;
const MAX_INTERACTING_FRONTIER_NODES = 768;
const MIN_IDLE_REFINEMENT_STEPS = 2_048;
const MIN_INTERACTING_REFINEMENT_STEPS = 1_024;
const MAX_IDLE_REFINEMENT_STEPS = 16_384;
const MAX_INTERACTING_REFINEMENT_STEPS = 8_192;

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

function buildTileMetrics(coordinate: TileCoordinate, radius: number): TileMetrics {
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

  return {
    center: SAMPLE_CARTESIAN.clone(),
    sphereRadius
  };
}

function buildLevelGeometricErrorByZoom(
  radius: number,
  meshMaxSegments: number,
  minZoom: number,
  maxZoom: number
): Map<number, number> {
  const byZoom = new Map<number, number>();
  const meshResolution = Math.max(2, Math.floor(meshMaxSegments));

  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const tilesAroundEquator = 2 ** zoom;
    const tileSpan = (Math.PI * 2 * radius) / tilesAroundEquator;
    byZoom.set(zoom, tileSpan / meshResolution);
  }

  return byZoom;
}

function computeNodePriority(
  coordinate: TileCoordinate,
  centerByZoom: ReadonlyMap<number, CenterTileByZoom>
): number {
  const center = centerByZoom.get(coordinate.z);

  if (!center) {
    return PRIORITY_BASELINE + coordinate.z * 16;
  }

  const dx = shortestWrappedTileDistance(coordinate.x, center.x, coordinate.z);
  const dy = Math.abs(coordinate.y - center.y);
  const distancePenalty = dx * dx + dy * dy;
  return PRIORITY_BASELINE + coordinate.z * 16 - distancePenalty;
}

function getSseThreshold(interactionPhase: SurfaceTileInteractionPhase): number {
  return interactionPhase === "idle" ? IDLE_SSE_THRESHOLD : INTERACTING_SSE_THRESHOLD;
}

function resolveFrontierBudget(
  viewportWidth: number,
  viewportHeight: number,
  interactionPhase: SurfaceTileInteractionPhase
): number {
  const viewportArea = Math.max(1, viewportWidth * viewportHeight);
  const baselineTileCount = Math.ceil(viewportArea / TILE_BUDGET_PIXEL_AREA);

  if (interactionPhase === "interacting") {
    return Math.max(
      MIN_INTERACTING_FRONTIER_NODES,
      Math.min(
        MAX_INTERACTING_FRONTIER_NODES,
        Math.round(baselineTileCount * INTERACTING_FRONTIER_SCALE)
      )
    );
  }

  return Math.max(
    MIN_IDLE_FRONTIER_NODES,
    Math.min(
      MAX_IDLE_FRONTIER_NODES,
      Math.round(baselineTileCount * IDLE_FRONTIER_SCALE)
    )
  );
}

function resolveRefinementStepBudget(
  frontierBudget: number,
  interactionPhase: SurfaceTileInteractionPhase
): number {
  if (interactionPhase === "interacting") {
    return Math.max(
      MIN_INTERACTING_REFINEMENT_STEPS,
      Math.min(MAX_INTERACTING_REFINEMENT_STEPS, frontierBudget * 6)
    );
  }

  return Math.max(
    MIN_IDLE_REFINEMENT_STEPS,
    Math.min(MAX_IDLE_REFINEMENT_STEPS, frontierBudget * 10)
  );
}

function evaluateNode(
  coordinate: TileCoordinate,
  radius: number,
  cameraPosition: Vector3,
  cameraDistance: number,
  projectionScale: number,
  levelGeometricErrorByZoom: ReadonlyMap<number, number>,
  tileMetricsCache: Map<string, TileMetrics>
): NodeEvaluation {
  const key = tileCoordinateKey(coordinate);
  let metrics = tileMetricsCache.get(key);

  if (!metrics) {
    metrics = buildTileMetrics(coordinate, radius);
    tileMetricsCache.set(key, metrics);
  }

  TILE_SPHERE.center.copy(metrics.center);
  TILE_SPHERE.radius = metrics.sphereRadius;

  if (!FRUSTUM.intersectsSphere(TILE_SPHERE)) {
    return { visible: false, sse: 0 };
  }

  const horizonTest = cameraPosition.dot(metrics.center) + cameraDistance * metrics.sphereRadius;
  const horizonThreshold = radius * radius - radius * metrics.sphereRadius - HORIZON_EPSILON;

  if (horizonTest < horizonThreshold) {
    return { visible: false, sse: 0 };
  }

  const geometricError = levelGeometricErrorByZoom.get(coordinate.z) ?? 0;
  const distanceToSurface = Math.max(
    MIN_DISTANCE_EPSILON,
    cameraPosition.distanceTo(metrics.center) - metrics.sphereRadius
  );
  const sse = (geometricError * projectionScale) / distanceToSurface;

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

function rankCandidates(candidates: CandidateNode[]): void {
  candidates.sort((left, right) => {
    if (left.sse !== right.sse) {
      return right.sse - left.sse;
    }

    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return tileCoordinateKey(left.coordinate).localeCompare(tileCoordinateKey(right.coordinate));
  });
}

function selectLeafCoordinates(
  options: SurfaceTileSelectionOptions,
  interactionPhase: SurfaceTileInteractionPhase
): TileCoordinate[] {
  FRUSTUM_MATRIX.multiplyMatrices(options.camera.projectionMatrix, options.camera.matrixWorldInverse);
  FRUSTUM.setFromProjectionMatrix(FRUSTUM_MATRIX);

  const cameraPosition = options.camera.position.clone();
  const cameraDistance = Math.max(MIN_DISTANCE_EPSILON, cameraPosition.length());
  const projectionScale = options.viewportHeight / (2 * Math.tan((options.camera.fov * Math.PI) / 360));
  const sseThreshold = getSseThreshold(interactionPhase);
  const maxFrontierNodes = resolveFrontierBudget(
    options.viewportWidth,
    options.viewportHeight,
    interactionPhase
  );
  const maxRefinementSteps = resolveRefinementStepBudget(maxFrontierNodes, interactionPhase);
  const levelGeometricErrorByZoom = buildLevelGeometricErrorByZoom(
    options.radius,
    options.meshMaxSegments,
    options.minZoom,
    options.maxZoom
  );
  const tileMetricsCache = new Map<string, TileMetrics>();
  const evaluationCache = new Map<string, NodeEvaluation>();
  const centerByZoom = buildCenterTileByZoom(
    cameraPosition,
    options.radius,
    options.minZoom,
    options.maxZoom
  );
  const leaves = new Map<string, TileCoordinate>();
  const candidates: CandidateNode[] = [];
  const queuedCandidateKeys = new Set<string>();

  const evaluate = (coordinate: TileCoordinate): NodeEvaluation => {
    const key = tileCoordinateKey(coordinate);
    const cached = evaluationCache.get(key);

    if (cached) {
      return cached;
    }

    const next = evaluateNode(
      coordinate,
      options.radius,
      cameraPosition,
      cameraDistance,
      projectionScale,
      levelGeometricErrorByZoom,
      tileMetricsCache
    );
    evaluationCache.set(key, next);
    return next;
  };

  const enqueueRefinementCandidate = (coordinate: TileCoordinate, evaluation: NodeEvaluation): void => {
    if (coordinate.z >= options.maxZoom || evaluation.sse <= sseThreshold) {
      return;
    }

    const key = tileCoordinateKey(coordinate);

    if (queuedCandidateKeys.has(key)) {
      return;
    }

    queuedCandidateKeys.add(key);
    candidates.push({
      coordinate,
      sse: evaluation.sse,
      priority: computeNodePriority(coordinate, centerByZoom)
    });
  };

  const minWorldTileCount = 2 ** options.minZoom;

  for (let y = 0; y < minWorldTileCount; y += 1) {
    for (let x = 0; x < minWorldTileCount; x += 1) {
      const coordinate = { z: options.minZoom, x, y };
      const evaluation = evaluate(coordinate);

      if (!evaluation.visible) {
        continue;
      }

      leaves.set(tileCoordinateKey(coordinate), coordinate);
      enqueueRefinementCandidate(coordinate, evaluation);
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

  let refinementSteps = 0;

  while (candidates.length > 0 && refinementSteps < maxRefinementSteps) {
    rankCandidates(candidates);
    const candidate = candidates.shift();

    if (!candidate) {
      break;
    }

    const parent = candidate.coordinate;
    const parentKey = tileCoordinateKey(parent);
    queuedCandidateKeys.delete(parentKey);

    if (!leaves.has(parentKey)) {
      continue;
    }

    if (parent.z >= options.maxZoom) {
      continue;
    }

    const parentEvaluation = evaluate(parent);

    if (!parentEvaluation.visible || parentEvaluation.sse <= sseThreshold) {
      continue;
    }

    const children = getChildCoordinates(parent);
    const childEvaluations = children.map((child) => ({
      coordinate: child,
      evaluation: evaluate(child)
    }));
    const visibleChildren = childEvaluations.filter((item) => item.evaluation.visible);

    if (visibleChildren.length === 0) {
      continue;
    }

    const leafDelta = visibleChildren.length - 1;

    if (leaves.size + leafDelta > maxFrontierNodes) {
      continue;
    }

    leaves.delete(parentKey);

    for (const item of visibleChildren) {
      const childKey = tileCoordinateKey(item.coordinate);
      leaves.set(childKey, item.coordinate);
      enqueueRefinementCandidate(item.coordinate, item.evaluation);
    }

    refinementSteps += 1;
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
