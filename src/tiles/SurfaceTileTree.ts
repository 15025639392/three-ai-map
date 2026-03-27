import { PerspectiveCamera } from "three";
import { cartesianToCartographic } from "../geo/projection";
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

function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = (clamped * Math.PI) / 180;
  return (
    (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * 2 ** zoom
  );
}

function coordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function coordinateParentAtZoom(coordinate: TileCoordinate, zoom: number): TileCoordinate {
  if (coordinate.z <= zoom) {
    return coordinate;
  }

  const delta = coordinate.z - zoom;
  const scale = 2 ** delta;
  return {
    z: zoom,
    x: normalizeTileX(Math.floor(coordinate.x / scale), zoom),
    y: Math.floor(coordinate.y / scale)
  };
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
  const detailZoom = Math.min(maxZoom, zoom + 1);

  if (detailZoom === zoom || uniqueCoordinates.length === 0) {
    return {
      zoom,
      coordinates: uniqueCoordinates
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
      coordinates: uniqueCoordinates
    };
  }

  // Prefer a single detailed LOD at seam-prone zoom ranges to avoid visible parent-child boundaries.
  const useUniformDetailLod = zoom >= maxZoom - 1 || zoom <= minZoom + 1;

  if (useUniformDetailLod) {
    const paddedDetailCoordinates = zoom <= minZoom + 1
      ? uniqueSortedCoordinates(expandCoordinates(detailCoordinates, 1))
      : detailCoordinates;
    return {
      zoom,
      coordinates: paddedDetailCoordinates
    };
  }

  const centerDirection = camera.position.clone().normalize().multiplyScalar(radius);
  const centerCartographic = cartesianToCartographic(
    {
      x: centerDirection.x,
      y: centerDirection.y,
      z: centerDirection.z
    },
    radius
  );
  const focusTileX = lngToTileX(centerCartographic.lng, detailZoom);
  const focusTileY = latToTileY(centerCartographic.lat, detailZoom);
  const worldTileCount = 2 ** detailZoom;
  const focusRadius = zoom >= maxZoom - 2 ? 3 : 2;
  const focusedDetailTiles = detailCoordinates.filter((coordinate) => {
    const dxRaw = Math.abs(coordinate.x - focusTileX);
    const dx = Math.min(dxRaw, worldTileCount - dxRaw);
    const dy = Math.abs(coordinate.y - focusTileY);
    return dx <= focusRadius && dy <= focusRadius;
  });
  const mergedDetailTiles = focusedDetailTiles.length > 0
    ? focusedDetailTiles
    : [detailCoordinates[0]];
  const refinedParentKeys = new Set(
    mergedDetailTiles.map((coordinate) => coordinateKey(coordinateParentAtZoom(coordinate, zoom)))
  );
  const blendedCoordinates = uniqueCoordinates.filter(
    (coordinate) => !refinedParentKeys.has(coordinateKey(coordinate))
  );
  blendedCoordinates.push(...mergedDetailTiles);

  return {
    zoom,
    coordinates: uniqueSortedCoordinates(blendedCoordinates)
  };
}
