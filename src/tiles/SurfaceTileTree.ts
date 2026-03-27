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
  const coordinates = computeVisibleTileCoordinates({
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    zoom
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
    zoom: detailZoom
  }));

  if (detailCoordinates.length === 0) {
    return {
      zoom,
      coordinates: uniqueCoordinates
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
  const focusRadius = 2;
  const focusedDetailTiles = detailCoordinates.filter((coordinate) => {
    const dx = Math.abs(coordinate.x - focusTileX);
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
