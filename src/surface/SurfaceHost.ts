import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";

export interface SurfacePlannerConfig {
  meshMaxSegments: number;
  minZoom: number;
  maxZoom: number;
}

export interface SurfaceHost {
  getActiveTileKeys(): string[];
  getActiveTileMesh(
    key: string
  ): Mesh<BufferGeometry, MeshStandardMaterial> | null;
  getActiveTileGeometryVersion?(key: string): number | null;
  getPlannerConfig?(): SurfacePlannerConfig;
}
