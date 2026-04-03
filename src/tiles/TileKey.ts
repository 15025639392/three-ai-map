import type { TileCoordinate } from "./TileViewport";

export function tileKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

export function parseTileKey(key: string): TileCoordinate {
  const [z, x, y] = key.split("/").map((part) => Number.parseInt(part, 10));

  return { z, x, y };
}
