import { PerspectiveCamera } from "three";
import {
  TileCoordinate,
  TileViewportSampleBounds,
  computeTargetZoom,
  computeVisibleTileCoordinates
} from "./TileViewport";

export interface SurfaceTileSelectionOptions {
  camera: PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  radius: number;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

export interface SurfaceTileSelection {
  zoom: number;
  coordinates: TileCoordinate[];
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
}

export interface SurfaceTilePlan {
  targetZoom: number;
  centerCoordinate: TileCoordinate;
  interactionPhase: SurfaceTileInteractionPhase;
  nodes: TileNodePlan[];
}

interface TileSamplingConfig {
  sampleColumns: number;
  sampleRows: number;
}

interface SurfaceTilePlannerConfig {
  coarseSampling: TileSamplingConfig;
  detailSampling: TileSamplingConfig;
  focusBounds: TileViewportSampleBounds;
  allowImmediateFullDetail: boolean;
}

const DEFAULT_FOCUS_BOUNDS: TileViewportSampleBounds = {
  left: 0.34,
  right: 0.66,
  top: 0.34,
  bottom: 0.66
};
const INTERACTION_FOCUS_BOUNDS: TileViewportSampleBounds = {
  left: 0.42,
  right: 0.58,
  top: 0.42,
  bottom: 0.58
};
const PRIORITY_BASELINE = 100_000;

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

function expandCoordinates(coordinates: TileCoordinate[], padding: number): TileCoordinate[] {
  if (padding <= 0 || coordinates.length === 0) {
    return coordinates;
  }

  const expanded: TileCoordinate[] = [];

  for (const coordinate of coordinates) {
    const worldTileCount = 2 ** coordinate.z;

    for (let dy = -padding; dy <= padding; dy += 1) {
      const y = coordinate.y + dy;

      if (y < 0 || y >= worldTileCount) {
        continue;
      }

      for (let dx = -padding; dx <= padding; dx += 1) {
        expanded.push({
          z: coordinate.z,
          x: normalizeTileX(coordinate.x + dx, coordinate.z),
          y
        });
      }
    }
  }

  return expanded;
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

function resolveSamplingConfig(targetZoom: number, minZoom: number): {
  lowMidZoom: boolean;
  coarseSampling: TileSamplingConfig;
  detailSampling: TileSamplingConfig;
} {
  const lowMidZoom = targetZoom <= minZoom + 1;

  return {
    lowMidZoom,
    coarseSampling: lowMidZoom
      ? { sampleColumns: 12, sampleRows: 10 }
      : { sampleColumns: 9, sampleRows: 7 },
    detailSampling: lowMidZoom
      ? { sampleColumns: 13, sampleRows: 11 }
      : { sampleColumns: 10, sampleRows: 8 }
  };
}

function resolveSurfaceTilePlannerConfig(
  interactionPhase: SurfaceTileInteractionPhase,
  targetZoom: number,
  minZoom: number
): SurfaceTilePlannerConfig {
  const { coarseSampling, detailSampling } = resolveSamplingConfig(targetZoom, minZoom);

  return {
    coarseSampling,
    detailSampling,
    focusBounds: interactionPhase === "idle" ? DEFAULT_FOCUS_BOUNDS : INTERACTION_FOCUS_BOUNDS,
    allowImmediateFullDetail: interactionPhase === "idle"
  };
}

function getViewportCenterCoordinate(
  options: SurfaceTileSelectionOptions,
  targetZoom: number
): TileCoordinate {
  return computeVisibleTileCoordinates({
    camera: options.camera,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    radius: options.radius,
    zoom: targetZoom,
    sampleColumns: 1,
    sampleRows: 1,
    sampleBounds: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5
    },
    paddingTiles: 0
  })[0];
}

function computeNodePriority(
  coordinate: TileCoordinate,
  centerCoordinate: TileCoordinate
): number {
  const zoomDelta = coordinate.z - centerCoordinate.z;
  const zoomScale = zoomDelta >= 0 ? 2 ** zoomDelta : 1 / (2 ** Math.abs(zoomDelta));
  const centerX = centerCoordinate.x * zoomScale;
  const centerY = centerCoordinate.y * zoomScale;
  const dx = shortestWrappedTileDistance(coordinate.x, centerX, coordinate.z);
  const dy = Math.abs(coordinate.y - centerY);
  const distancePenalty = dx * dx + dy * dy;

  return PRIORITY_BASELINE - distancePenalty;
}

function sortNodesByPriority(nodes: TileNodePlan[]): TileNodePlan[] {
  return [...nodes].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.key.localeCompare(right.key);
  });
}

function selectLeafCoordinates(
  options: SurfaceTileSelectionOptions,
  targetZoom: number,
  interactionPhase: SurfaceTileInteractionPhase
): TileCoordinate[] {
  const plannerConfig = resolveSurfaceTilePlannerConfig(
    interactionPhase,
    targetZoom,
    options.minZoom
  );
  const { lowMidZoom } = resolveSamplingConfig(targetZoom, options.minZoom);
  const coordinates = computeVisibleTileCoordinates({
    camera: options.camera,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    radius: options.radius,
    zoom: targetZoom,
    sampleColumns: plannerConfig.coarseSampling.sampleColumns,
    sampleRows: plannerConfig.coarseSampling.sampleRows
  });
  const uniqueCoordinates = uniqueSortedCoordinates(coordinates);
  const paddedCoordinates = uniqueSortedCoordinates(expandCoordinates(uniqueCoordinates, 1));
  const detailZoom = Math.min(options.maxZoom, targetZoom + 1);

  if (
    detailZoom === targetZoom ||
    uniqueCoordinates.length === 0
  ) {
    return paddedCoordinates;
  }

  const detailCoordinates = uniqueSortedCoordinates(computeVisibleTileCoordinates({
    camera: options.camera,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    radius: options.radius,
    zoom: detailZoom,
    sampleColumns: plannerConfig.detailSampling.sampleColumns,
    sampleRows: plannerConfig.detailSampling.sampleRows
  }));

  if (detailCoordinates.length === 0) {
    return paddedCoordinates;
  }

  const paddedDetailCoordinates = uniqueSortedCoordinates(expandCoordinates(detailCoordinates, 1));

  if (plannerConfig.allowImmediateFullDetail && detailZoom === options.maxZoom) {
    return paddedDetailCoordinates;
  }

  if (
    plannerConfig.allowImmediateFullDetail &&
    (lowMidZoom || paddedDetailCoordinates.length <= 96)
  ) {
    return paddedDetailCoordinates;
  }

  const focusCoordinates = uniqueSortedCoordinates(computeVisibleTileCoordinates({
    camera: options.camera,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    radius: options.radius,
    zoom: detailZoom,
    sampleColumns: plannerConfig.detailSampling.sampleColumns,
    sampleRows: plannerConfig.detailSampling.sampleRows,
    sampleBounds: plannerConfig.focusBounds,
    paddingTiles: 0
  }));

  if (focusCoordinates.length === 0) {
    return plannerConfig.allowImmediateFullDetail ? paddedDetailCoordinates : paddedCoordinates;
  }

  const coarseKeySet = new Set(paddedCoordinates.map((coordinate) => tileCoordinateKey(coordinate)));
  const refinedParentKeys = new Set<string>();

  for (const coordinate of focusCoordinates) {
    const parent = getParentCoordinate(coordinate);
    const key = tileCoordinateKey(parent);

    if (!coarseKeySet.has(key)) {
      continue;
    }

    refinedParentKeys.add(key);
  }

  if (refinedParentKeys.size === 0) {
    return plannerConfig.allowImmediateFullDetail ? paddedDetailCoordinates : paddedCoordinates;
  }

  const mixedCoordinates: TileCoordinate[] = [];

  for (const coordinate of paddedCoordinates) {
    const key = tileCoordinateKey(coordinate);

    if (!refinedParentKeys.has(key)) {
      mixedCoordinates.push(coordinate);
      continue;
    }

    mixedCoordinates.push(...getChildCoordinates(coordinate));
  }

  const uniqueMixedCoordinates = uniqueSortedCoordinates(mixedCoordinates);

  if (
    plannerConfig.allowImmediateFullDetail &&
    uniqueMixedCoordinates.length >= Math.floor(paddedDetailCoordinates.length * 0.95)
  ) {
    return paddedDetailCoordinates;
  }

  return uniqueMixedCoordinates;
}

export function planSurfaceTileNodes(
  options: SurfaceTilePlannerOptions
): SurfaceTilePlan {
  const interactionPhase = options.interactionPhase ?? "idle";
  const targetZoom = computeTargetZoom({
    camera: options.camera,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    radius: options.radius,
    tileSize: options.tileSize,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom
  });
  const centerCoordinate = getViewportCenterCoordinate(options, targetZoom);
  const coordinates = selectLeafCoordinates(options, targetZoom, interactionPhase);
  const nodes = sortNodesByPriority(coordinates.map((coordinate) => ({
    key: tileCoordinateKey(coordinate),
    coordinate,
    parentKey: coordinate.z === 0 ? null : tileCoordinateKey(getParentCoordinate(coordinate)),
    priority: computeNodePriority(coordinate, centerCoordinate),
    // This planner currently emits the visible frontier only. Parent fallback stays runtime state
    // on consuming layers and is reachable through parentKey instead of extra parent plan nodes.
    wantedState: "leaf",
    interactionPhase
  })));

  return {
    targetZoom,
    centerCoordinate,
    interactionPhase,
    nodes
  };
}
