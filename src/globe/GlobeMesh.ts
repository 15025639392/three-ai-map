import { Mesh, MeshStandardMaterial, SphereGeometry, Texture } from "three";
import { createGlobeMaterial } from "./GlobeMaterial";

interface GlobeMeshOptions {
  radius: number;
  widthSegments?: number;
  heightSegments?: number;
  terrainStrength?: number;
}

export class GlobeMesh {
  readonly material: MeshStandardMaterial;
  readonly mesh: Mesh<SphereGeometry, MeshStandardMaterial>;

  constructor({
    radius,
    widthSegments = 96,
    heightSegments = 64,
    terrainStrength = 0
  }: GlobeMeshOptions) {
    this.material = createGlobeMaterial();
    const geometry = new SphereGeometry(radius, widthSegments, heightSegments);

    if (terrainStrength > 0) {
      const positions = geometry.attributes.position;

      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        const length = Math.sqrt(x * x + y * y + z * z) || 1;
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;
        const terrainSample =
          Math.sin((nx + ny + nz) * 7.0) * 0.5 +
          Math.cos(ny * 11.0) * 0.35 +
          Math.sin(nx * 13.0) * 0.15;
        const displacedRadius = radius + terrainSample * terrainStrength;

        positions.setXYZ(index, nx * displacedRadius, ny * displacedRadius, nz * displacedRadius);
      }

      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    this.mesh = new Mesh(geometry, this.material);
  }

  setTexture(texture: Texture | null): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
