import type { TileCoordinate } from "../tiles/TileViewport";

export type SurfaceNeighborDirection = "top" | "right" | "bottom" | "left";

export interface SurfaceNeighborRef {
  key: string;
  lodDelta: number;
}

export interface SurfaceTileAdjacency {
  top: SurfaceNeighborRef | null;
  right: SurfaceNeighborRef | null;
  bottom: SurfaceNeighborRef | null;
  left: SurfaceNeighborRef | null;
}

const DIRECTIONS: SurfaceNeighborDirection[] = ["top", "right", "bottom", "left"];

function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function getNeighborAtZoom(
  coordinate: TileCoordinate,
  direction: SurfaceNeighborDirection,
  zoom: number
): TileCoordinate | null {
  const scale = 2 ** Math.max(0, coordinate.z - zoom);
  const baseX = Math.floor(coordinate.x / scale);
  const baseY = Math.floor(coordinate.y / scale);
  const worldTileCount = 2 ** zoom;
  let x = baseX;
  let y = baseY;

  if (direction === "top") {
    y -= 1;
  } else if (direction === "right") {
    x += 1;
  } else if (direction === "bottom") {
    y += 1;
  } else {
    x -= 1;
  }

  if (y < 0 || y >= worldTileCount) {
    return null;
  }

  return {
    z: zoom,
    x: normalizeTileX(x, zoom),
    y
  };
}

function findAncestorOrSameNeighbor(
  coordinate: TileCoordinate,
  direction: SurfaceNeighborDirection,
  keySet: ReadonlySet<string>
): SurfaceNeighborRef | null {
  for (let zoom = coordinate.z; zoom >= 0; zoom -= 1) {
    const neighbor = getNeighborAtZoom(coordinate, direction, zoom);

    if (!neighbor) {
      continue;
    }

    const key = tileCoordinateKey(neighbor);
    if (!keySet.has(key)) {
      continue;
    }

    return {
      key,
      lodDelta: coordinate.z - zoom
    };
  }

  return null;
}

function findDescendantNeighbor(
  coordinate: TileCoordinate,
  direction: SurfaceNeighborDirection,
  byZoom: ReadonlyMap<number, readonly TileCoordinate[]>,
  maxZoom: number
): SurfaceNeighborRef | null {
  const sameZoomNeighbor = getNeighborAtZoom(coordinate, direction, coordinate.z);

  if (!sameZoomNeighbor) {
    return null;
  }

  for (let zoom = maxZoom; zoom > coordinate.z; zoom -= 1) {
    const candidates = byZoom.get(zoom);

    if (!candidates || candidates.length === 0) {
      continue;
    }

    const scale = 2 ** (zoom - coordinate.z);
    const minX = sameZoomNeighbor.x * scale;
    const maxX = minX + scale - 1;
    const minY = sameZoomNeighbor.y * scale;
    const maxY = minY + scale - 1;

    for (const candidate of candidates) {
      if (
        candidate.x >= minX &&
        candidate.x <= maxX &&
        candidate.y >= minY &&
        candidate.y <= maxY
      ) {
        return {
          key: tileCoordinateKey(candidate),
          lodDelta: coordinate.z - zoom
        };
      }
    }
  }

  return null;
}

export function createEmptyAdjacency(): SurfaceTileAdjacency {
  return {
    top: null,
    right: null,
    bottom: null,
    left: null
  };
}

export function buildSurfaceAdjacencyMap(
  coordinates: readonly TileCoordinate[]
): Map<string, SurfaceTileAdjacency> {
  const keys = new Set(coordinates.map((coordinate) => tileCoordinateKey(coordinate)));
  const maxZoom = coordinates.reduce((max, coordinate) => Math.max(max, coordinate.z), 0);
  const byZoom = new Map<number, TileCoordinate[]>();

  for (const coordinate of coordinates) {
    const bucket = byZoom.get(coordinate.z);
    if (bucket) {
      bucket.push(coordinate);
    } else {
      byZoom.set(coordinate.z, [coordinate]);
    }
  }

  const adjacencyByKey = new Map<string, SurfaceTileAdjacency>();

  for (const coordinate of coordinates) {
    const adjacency = createEmptyAdjacency();

    for (const direction of DIRECTIONS) {
      const sameOrAncestor = findAncestorOrSameNeighbor(coordinate, direction, keys);
      const ref = sameOrAncestor?.lodDelta === 0
        ? sameOrAncestor
        : findDescendantNeighbor(coordinate, direction, byZoom, maxZoom) ?? sameOrAncestor;
      adjacency[direction] = ref;
    }

    adjacencyByKey.set(tileCoordinateKey(coordinate), adjacency);
  }

  return adjacencyByKey;
}
