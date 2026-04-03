import { Group, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { SurfaceSystem } from "../../../src/surface/SurfaceSystem";

describe("SurfaceSystem", () => {
  it("should output a visible root tile set", () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;

    const surfaceSystem = new SurfaceSystem({
      scene: new Group(),
      camera,
      radius: 1,
      rendererElement: canvas
    });

    expect(surfaceSystem.getVisibleTileKeys().length).toBeGreaterThan(0);
  });
});
