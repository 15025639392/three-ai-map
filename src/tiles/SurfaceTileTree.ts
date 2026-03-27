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
  const coordinates = computeVisibleTileCoordinates({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    zoom
  });
  const uniqueCoordinates = [...new Map(
    coordinates.map((coordinate) => [`${coordinate.z}/${coordinate.x}/${coordinate.y}`, coordinate])
  ).values()].sort((left, right) => {
    if (left.z !== right.z) {
      return left.z - right.z;
    }
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });

  return {
    zoom,
    coordinates: uniqueCoordinates
  };
}
