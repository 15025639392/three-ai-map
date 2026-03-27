import { MeshStandardMaterial, Texture } from "three";

interface GlobeMaterialOptions {
  texture?: Texture | null;
}

export function createGlobeMaterial({
  texture = null
}: GlobeMaterialOptions = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: "#86a8ff",
    roughness: 0.95,
    metalness: 0.02,
    map: texture
  });
}
