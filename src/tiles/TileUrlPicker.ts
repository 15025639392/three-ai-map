import type { TileCoordinate } from "./TileViewport";

export function pickTileTemplate(tiles: string[], coordinate: TileCoordinate): string {
  if (tiles.length === 0) {
    throw new Error("TileUrlPicker requires at least one tile template");
  }

  const index = Math.abs((coordinate.x + coordinate.y + coordinate.z) % tiles.length);
  return tiles[index] ?? tiles[0]!;
}

export function formatTileUrl(templateUrl: string, coordinate: TileCoordinate): string {
  return templateUrl
    .replace("{z}", `${coordinate.z}`)
    .replace("{x}", `${coordinate.x}`)
    .replace("{y}", `${coordinate.y}`);
}

