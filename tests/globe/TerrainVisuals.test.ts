import { Scene } from "three";
import { AtmosphereMesh } from "../../src/globe/AtmosphereMesh";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { Starfield } from "../../src/globe/Starfield";
import { WGS84_RADIUS } from "../../src/geo/ellipsoid";

describe("third-phase globe visuals", () => {
  it("displaces globe vertices when elevation sampler is set", () => {
    const globe = new GlobeMesh({ radius: 1 });
    const positionsBefore = globe.mesh.geometry.attributes.position.array as Float32Array;
    const radiusBefore = Math.sqrt(
      positionsBefore[0] * positionsBefore[0] +
        positionsBefore[1] * positionsBefore[1] +
        positionsBefore[2] * positionsBefore[2]
    );

    globe.setElevationSampler(() => WGS84_RADIUS, 1);
    const positionsAfter = globe.mesh.geometry.attributes.position.array as Float32Array;
    const radiusAfter = Math.sqrt(
      positionsAfter[0] * positionsAfter[0] +
        positionsAfter[1] * positionsAfter[1] +
        positionsAfter[2] * positionsAfter[2]
    );

    expect(radiusAfter).not.toBeCloseTo(radiusBefore);
  });

  it("creates atmosphere and starfield scene nodes", () => {
    const scene = new Scene();
    const atmosphere = new AtmosphereMesh(1);
    const starfield = new Starfield(64, 12);

    scene.add(atmosphere.mesh);
    scene.add(starfield.points);

    expect(scene.children).toHaveLength(2);
  });
});
