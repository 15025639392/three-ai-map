import { BufferAttribute, Mesh, MeshStandardMaterial, SphereGeometry, Texture } from "three";
import { WGS84_RADIUS } from "../geo/ellipsoid";
import { createGlobeMaterial } from "./GlobeMaterial";

export type ElevationSampler = (u: number, v: number) => number;

interface GlobeMeshOptions {
  radius: number;
  widthSegments?: number;
  heightSegments?: number;
  terrainStrength?: number;
}

export class GlobeMesh {
  readonly material: MeshStandardMaterial;
  readonly mesh: Mesh<SphereGeometry, MeshStandardMaterial>;

  private readonly radius: number;
  private readonly terrainStrength: number;
  private readonly basePositions: Float32Array;
  private readonly baseUvs: Float32Array;
  private elevationSampler: ElevationSampler | null = null;
  private elevationExaggeration = 1;

  constructor({
    radius,
    widthSegments = 96,
    heightSegments = 64,
    terrainStrength = 0
  }: GlobeMeshOptions) {
    this.radius = radius;
    this.terrainStrength = terrainStrength;
    this.material = createGlobeMaterial();
    const geometry = new SphereGeometry(radius, widthSegments, heightSegments);
    this.basePositions = new Float32Array(geometry.attributes.position.array);
    this.baseUvs = new Float32Array(geometry.attributes.uv.array);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = -1; // Render first as base
    this.applyElevation();
  }

  setTexture(texture: Texture | null): void {
    if (this.material.map && this.material.map !== texture) {
      this.material.map.dispose();
    }
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  setElevationSampler(elevationSampler: ElevationSampler | null, exaggeration = 1): void {
    this.elevationSampler = elevationSampler;
    this.elevationExaggeration = exaggeration;
    this.applyElevation();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }

  private applyElevation(): void {
    const geometry = this.mesh.geometry;
    const positions = geometry.attributes.position as BufferAttribute;

    for (let index = 0; index < positions.count; index += 1) {
      const baseOffset = index * 3;
      const uvOffset = index * 2;
      const x = this.basePositions[baseOffset];
      const y = this.basePositions[baseOffset + 1];
      const z = this.basePositions[baseOffset + 2];
      const length = Math.sqrt(x * x + y * y + z * z) || 1;
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;
      const u = this.baseUvs[uvOffset];
      const v = this.baseUvs[uvOffset + 1];
      const displacement = this.sampleElevation(nx, ny, nz, u, v);
      const displacedRadius = this.radius + displacement;

      positions.setXYZ(index, nx * displacedRadius, ny * displacedRadius, nz * displacedRadius);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  private sampleElevation(nx: number, ny: number, nz: number, u: number, v: number): number {
    if (this.elevationSampler) {
      const heightMeters = this.elevationSampler(u, v);
      return (heightMeters / WGS84_RADIUS) * this.radius * this.elevationExaggeration;
    }

    if (this.terrainStrength <= 0) {
      return 0;
    }

    const terrainSample =
      Math.sin((nx + ny + nz) * 7.0) * 0.5 +
      Math.cos(ny * 11.0) * 0.35 +
      Math.sin(nx * 13.0) * 0.15;
    return terrainSample * this.terrainStrength;
  }
}
