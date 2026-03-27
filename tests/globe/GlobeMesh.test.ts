import { Texture } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";

describe("GlobeMesh", () => {
  it("creates a sphere mesh with the requested radius", () => {
    const globe = new GlobeMesh({ radius: 2 });

    expect(globe.mesh.geometry.parameters.radius).toBe(2);
  });

  it("updates the material texture", () => {
    const globe = new GlobeMesh({ radius: 1 });
    const texture = new Texture();

    globe.setTexture(texture);

    expect(globe.material.map).toBe(texture);
  });

  it("applies sampled elevation to the sphere geometry", () => {
    const globe = new GlobeMesh({ radius: 1, widthSegments: 16, heightSegments: 12 });
    const positions = globe.mesh.geometry.attributes.position;
    let maxRadiusBefore = 0;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      maxRadiusBefore = Math.max(maxRadiusBefore, Math.sqrt(x * x + y * y + z * z));
    }

    globe.setElevationSampler(() => 1500, 1);

    let maxRadiusAfter = 0;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      maxRadiusAfter = Math.max(maxRadiusAfter, Math.sqrt(x * x + y * y + z * z));
    }

    expect(maxRadiusAfter).toBeGreaterThan(maxRadiusBefore);
  });
});
