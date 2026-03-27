import { intersectRayWithSphere } from "../../src/geo/raycast";

describe("raycast", () => {
  it("returns the nearest hit point on a sphere", () => {
    const hit = intersectRayWithSphere(
      { x: 0, y: 0, z: 3 },
      { x: 0, y: 0, z: -1 },
      1
    );

    expect(hit).not.toBeNull();
    expect(hit?.z).toBeCloseTo(1);
  });

  it("returns null when the ray misses the sphere", () => {
    const hit = intersectRayWithSphere(
      { x: 0, y: 0, z: 3 },
      { x: 1, y: 0, z: 0 },
      1
    );

    expect(hit).toBeNull();
  });
});
