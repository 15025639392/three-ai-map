import type { TileCoordinate } from "./TileViewport";
import {
  planSurfaceTileNodes,
  uniqueSortedCoordinates,
  type SurfaceTileSelection,
  type SurfaceTileSelectionOptions
} from "./SurfaceTilePlanner";

export type { SurfaceTileSelection, SurfaceTileSelectionOptions } from "./SurfaceTilePlanner";

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

export function selectSurfaceTileCoordinates(
  options: SurfaceTileSelectionOptions
): SurfaceTileSelection {
  const plan = planSurfaceTileNodes({
    ...options,
    interactionPhase: "idle"
  });

  return {
    zoom: plan.targetZoom,
    coordinates: uniqueSortedCoordinates(plan.nodes.map((node) => node.coordinate))
  };
}
