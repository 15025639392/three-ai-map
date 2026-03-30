import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";

export interface SurfaceTilePlannerConfig {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

export interface TerrainTileHost {
  getActiveTileKeys(): string[];
  getActiveTileMesh(
    key: string
  ): Mesh<BufferGeometry, MeshStandardMaterial> | null;
  getSurfaceTilePlannerConfig?(): SurfaceTilePlannerConfig;
}
