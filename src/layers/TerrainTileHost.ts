import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";

export interface TerrainTileHost {
  getActiveTileKeys(): string[];
  getActiveTileMesh(
    key: string
  ): Mesh<BufferGeometry, MeshStandardMaterial> | null;
}

