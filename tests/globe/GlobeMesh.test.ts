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
});
