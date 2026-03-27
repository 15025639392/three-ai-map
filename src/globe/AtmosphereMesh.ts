import {
  AdditiveBlending,
  BackSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry
} from "three";

export class AtmosphereMesh {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor(radius: number) {
    this.mesh = new Mesh(
      new SphereGeometry(radius * 1.035, 64, 48),
      new MeshBasicMaterial({
        color: "#5fb7ff",
        transparent: true,
        opacity: 0.18,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending
      })
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
