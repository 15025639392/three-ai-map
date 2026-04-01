import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";

export interface SurfaceTilePlannerConfig {
  meshMaxSegments: number;
  minZoom: number;
  maxZoom: number;
}

export interface TerrainTileHost {
  getActiveTileKeys(): string[];
  getActiveTileMesh(
    key: string
  ): Mesh<BufferGeometry, MeshStandardMaterial> | null;
  getActiveTileGeometryVersion?(key: string): number | null;
  getSurfaceTilePlannerConfig?(): SurfaceTilePlannerConfig;
}
