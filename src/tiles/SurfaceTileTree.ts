import { PerspectiveCamera } from "three";
import {
  TileCoordinate,
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

export interface SurfaceTileBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

function mercatorToLatitude(normalizedY: number): number {
  const mercator = Math.PI * (1 - 2 * normalizedY);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function coordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function getParentCoordinate(coordinate: TileCoordinate): TileCoordinate {
  return {
    z: Math.max(0, coordinate.z - 1),
    x: Math.floor(coordinate.x / 2),
    y: Math.floor(coordinate.y / 2)
  };
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

function uniqueSortedCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return sortCoordinates([...new Map(
    coordinates.map((coordinate) => [coordinateKey(coordinate), coordinate])
  ).values()]);
}

export function getSurfaceTileBounds(coordinate: TileCoordinate): SurfaceTileBounds {
  const worldTileCount = 2 ** coordinate.z;
  const west = (coordinate.x / worldTileCount) * 360 - 180;
  const east = ((coordinate.x + 1) / worldTileCount) * 360 - 180;
  const north = mercatorToLatitude(coordinate.y / worldTileCount);
  const south = mercatorToLatitude((coordinate.y + 1) / worldTileCount);

  return {
    west,
    east,
    south,
    north
  };
}

export function selectSurfaceTileCoordinates({
  camera,
  viewportWidth,
  viewportHeight,
  radius,
  tileSize,
  minZoom,
  maxZoom
}: SurfaceTileSelectionOptions): SurfaceTileSelection {
  const zoom = computeTargetZoom({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    tileSize,
    minZoom,
    maxZoom
  });
  const lowMidZoom = zoom <= minZoom + 1;
  const coarseSampling = lowMidZoom
    ? { sampleColumns: 12, sampleRows: 10 }
    : { sampleColumns: 9, sampleRows: 7 };
  const detailSampling = lowMidZoom
    ? { sampleColumns: 13, sampleRows: 11 }
    : { sampleColumns: 10, sampleRows: 8 };
  const coordinates = computeVisibleTileCoordinates({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    zoom,
    sampleColumns: coarseSampling.sampleColumns,
    sampleRows: coarseSampling.sampleRows
  });
  const uniqueCoordinates = uniqueSortedCoordinates(coordinates);
  const paddedCoordinates = uniqueSortedCoordinates(expandCoordinates(uniqueCoordinates, 1));
  const detailZoom = Math.min(maxZoom, zoom + 1);

  if (detailZoom === zoom || uniqueCoordinates.length === 0) {
    return {
      zoom,
      coordinates: paddedCoordinates
    };
  }

  const detailCoordinates = uniqueSortedCoordinates(computeVisibleTileCoordinates({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    zoom: detailZoom,
    sampleColumns: detailSampling.sampleColumns,
    sampleRows: detailSampling.sampleRows
  }));

  if (detailCoordinates.length === 0) {
    return {
      zoom,
      coordinates: paddedCoordinates
    };
  }

  // Keep one extra ring so the active-tile boundary stays off-screen, reducing seam exposure from
  // visibility sampling at high zoom.
  const paddedDetailCoordinates = uniqueSortedCoordinates(expandCoordinates(detailCoordinates, 1));

  // Avoid mixed LOD at the maximum-detail boundary: seams are most noticeable there and the leaf
  // count is already bounded by the tight view footprint.
  if (detailZoom === maxZoom) {
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  // If the detailed set is already small, prefer a single LOD to avoid visible transitions.
  if (lowMidZoom || paddedDetailCoordinates.length <= 96) {
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  // Select a focus region near the center of the screen and refine parents that intersect it.
  const focusBounds = { left: 0.34, right: 0.66, top: 0.34, bottom: 0.66 };
  const focusCoordinates = uniqueSortedCoordinates(computeVisibleTileCoordinates({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    zoom: detailZoom,
    sampleColumns: detailSampling.sampleColumns,
    sampleRows: detailSampling.sampleRows,
    sampleBounds: focusBounds,
    paddingTiles: 0
  }));

  if (focusCoordinates.length === 0) {
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  const coarseKeySet = new Set(paddedCoordinates.map((coordinate) => coordinateKey(coordinate)));
  const refinedParentKeys = new Set<string>();

  for (const coordinate of focusCoordinates) {
    const parent = getParentCoordinate(coordinate);
    const key = coordinateKey(parent);

    if (!coarseKeySet.has(key)) {
      continue;
    }

    refinedParentKeys.add(key);
  }

  if (refinedParentKeys.size === 0) {
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  const mixedCoordinates: TileCoordinate[] = [];

  for (const coordinate of paddedCoordinates) {
    const key = coordinateKey(coordinate);

    if (!refinedParentKeys.has(key)) {
      mixedCoordinates.push(coordinate);
      continue;
    }

    mixedCoordinates.push(...getChildCoordinates(coordinate));
  }

  const uniqueMixedCoordinates = uniqueSortedCoordinates(mixedCoordinates);

  // Mixed LOD is only worthwhile when it materially reduces the number of tiles.
  if (uniqueMixedCoordinates.length >= Math.floor(paddedDetailCoordinates.length * 0.95)) {
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  return {
    zoom,
    coordinates: uniqueMixedCoordinates
  };
}
