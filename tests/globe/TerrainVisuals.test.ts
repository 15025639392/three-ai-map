import { Scene } from "three";
import { AtmosphereMesh } from "../../src/globe/AtmosphereMesh";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { Starfield } from "../../src/globe/Starfield";

describe("third-phase globe visuals", () => {
  it("displaces globe vertices when terrain is enabled", () => {
    const flat = new GlobeMesh({ radius: 1 });
    const terrain = new GlobeMesh({ radius: 1, terrainStrength: 0.08 });
    const flatPositions = flat.mesh.geometry.attributes.position.array as Float32Array;
    const terrainPositions = terrain.mesh.geometry.attributes.position.array as Float32Array;
    const flatRadius = Math.sqrt(
      flatPositions[0] * flatPositions[0] +
        flatPositions[1] * flatPositions[1] +
        flatPositions[2] * flatPositions[2]
    );
    const terrainRadius = Math.sqrt(
      terrainPositions[0] * terrainPositions[0] +
        terrainPositions[1] * terrainPositions[1] +
        terrainPositions[2] * terrainPositions[2]
    );

    expect(terrainRadius).not.toBeCloseTo(flatRadius);
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
