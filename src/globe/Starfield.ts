import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Vector3
} from "three";

export class Starfield {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(count: number, radius: number) {
    const positions: number[] = [];

    for (let index = 0; index < count; index += 1) {
      const direction = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      const distance = radius * (0.92 + Math.random() * 0.16);

      positions.push(
        direction.x * distance,
        direction.y * distance,
        direction.z * distance
      );
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: "#f5fbff",
        size: 0.06,
        sizeAttenuation: true
      })
    );
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
