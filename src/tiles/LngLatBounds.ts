import type { TileCoordinate } from "./TileViewport";

export type LngLatBounds = [number, number, number, number]; // [west,south,east,north]

export interface TileLngLatBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

function mercatorToLatitude(normalizedY: number): number {
  const mercator = Math.PI * (1 - 2 * normalizedY);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

export function getWebMercatorTileBounds(coordinate: TileCoordinate): TileLngLatBounds {
  const worldTileCount = 2 ** coordinate.z;
  const west = (coordinate.x / worldTileCount) * 360 - 180;
  const east = ((coordinate.x + 1) / worldTileCount) * 360 - 180;
  const north = mercatorToLatitude(coordinate.y / worldTileCount);
  const south = mercatorToLatitude((coordinate.y + 1) / worldTileCount);

  return { west, east, south, north };
}

export function normalizeLngLatBounds(bounds: LngLatBounds): LngLatBounds {
  const [west, south, east, north] = bounds;
  const safeSouth = Math.min(south, north);
  const safeNorth = Math.max(south, north);
  return [west, safeSouth, east, safeNorth];
}

function toLngIntervals(bounds: LngLatBounds): Array<[number, number]> {
  const [west, _south, east] = bounds;

  if (west <= east) {
    return [[west, east]];
  }

  // Dateline wrap: treat as two intervals.
  return [[west, 180], [-180, east]];
}

function intervalsIntersect(left: [number, number], right: [number, number]): boolean {
  return left[0] <= right[1] && right[0] <= left[1];
}

export function boundsIntersect(left: LngLatBounds, right: LngLatBounds): boolean {
  const l = normalizeLngLatBounds(left);
  const r = normalizeLngLatBounds(right);

  const lSouth = l[1];
  const lNorth = l[3];
  const rSouth = r[1];
  const rNorth = r[3];

  if (lSouth > rNorth || rSouth > lNorth) {
    return false;
  }

  const lIntervals = toLngIntervals(l);
  const rIntervals = toLngIntervals(r);

  for (const li of lIntervals) {
    for (const ri of rIntervals) {
      if (intervalsIntersect(li, ri)) {
        return true;
      }
    }
  }

  return false;
}

export function shouldRequestDemForCoordinate(
  coordinate: TileCoordinate,
  extraBounds: LngLatBounds[] | undefined
): boolean {
  if (extraBounds === undefined || extraBounds.length === 0) {
    return true;
  }

  const tileBounds = getWebMercatorTileBounds(coordinate);
  const tileBox: LngLatBounds = [tileBounds.west, tileBounds.south, tileBounds.east, tileBounds.north];

  for (const box of extraBounds) {
    if (boundsIntersect(tileBox, box)) {
      return true;
    }
  }

  return false;
}
