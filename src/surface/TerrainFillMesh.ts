import type { SurfaceTileAdjacency, SurfaceNeighborDirection } from "./SurfaceAdjacency";

export interface TileSkirtMask {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface TerrainFillStats {
  fillEdgeCount: number;
  fillCornerCount: number;
  maxNeighborLodDelta: number;
  crackDetectedCount: number;
}

const DIRECTIONS: SurfaceNeighborDirection[] = ["top", "right", "bottom", "left"];

function requiresFill(adjacency: SurfaceTileAdjacency, direction: SurfaceNeighborDirection): boolean {
  const neighbor = adjacency[direction];
  return !neighbor || neighbor.lodDelta !== 0;
}

export function buildTileSkirtMaskFromAdjacency(adjacency: SurfaceTileAdjacency | null): TileSkirtMask {
  if (!adjacency) {
    return { top: true, right: true, bottom: true, left: true };
  }

  return {
    top: requiresFill(adjacency, "top"),
    right: requiresFill(adjacency, "right"),
    bottom: requiresFill(adjacency, "bottom"),
    left: requiresFill(adjacency, "left")
  };
}

export function buildTerrainFillStats(
  tileKeys: readonly string[],
  adjacencyByKey: ReadonlyMap<string, SurfaceTileAdjacency>
): TerrainFillStats {
  let fillEdgeCount = 0;
  let fillCornerCount = 0;
  let maxNeighborLodDelta = 0;
  let crackDetectedCount = 0;

  for (const key of tileKeys) {
    const adjacency = adjacencyByKey.get(key);

    if (!adjacency) {
      continue;
    }

    const top = requiresFill(adjacency, "top");
    const right = requiresFill(adjacency, "right");
    const bottom = requiresFill(adjacency, "bottom");
    const left = requiresFill(adjacency, "left");
    const fillFlags = [top, right, bottom, left];
    let tileHasCrackRisk = false;

    for (let index = 0; index < DIRECTIONS.length; index += 1) {
      const direction = DIRECTIONS[index];
      const neighbor = adjacency[direction];
      if (fillFlags[index]) {
        fillEdgeCount += 1;
      }

      if (!neighbor) {
        tileHasCrackRisk = true;
        continue;
      }

      const absDelta = Math.abs(neighbor.lodDelta);
      maxNeighborLodDelta = Math.max(maxNeighborLodDelta, absDelta);
      if (absDelta > 1) {
        tileHasCrackRisk = true;
      }
    }

    if (top && right) {
      fillCornerCount += 1;
    }
    if (right && bottom) {
      fillCornerCount += 1;
    }
    if (bottom && left) {
      fillCornerCount += 1;
    }
    if (left && top) {
      fillCornerCount += 1;
    }

    if (tileHasCrackRisk) {
      crackDetectedCount += 1;
    }
  }

  return {
    fillEdgeCount,
    fillCornerCount,
    maxNeighborLodDelta,
    crackDetectedCount
  };
}
