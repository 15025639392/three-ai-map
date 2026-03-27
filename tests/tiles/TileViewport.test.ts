import { PerspectiveCamera } from "three";
import {
  computeTargetZoom,
  computeVisibleTileCoordinates
} from "../../src/tiles/TileViewport";

function createCamera(distance: number, aspect = 1): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe("TileViewport", () => {
  it("selects a higher zoom when the camera is closer to the globe", () => {
    const nearCamera = createCamera(1.6);
    const farCamera = createCamera(4.5);

    const nearZoom = computeTargetZoom({
      camera: nearCamera,
      viewportWidth: 800,
      viewportHeight: 600,
      radius: 1,
      tileSize: 128,
      minZoom: 1,
      maxZoom: 6
    });
    const farZoom = computeTargetZoom({
      camera: farCamera,
      viewportWidth: 800,
      viewportHeight: 600,
      radius: 1,
      tileSize: 128,
      minZoom: 1,
      maxZoom: 6
    });

    expect(nearZoom).toBeGreaterThan(farZoom);
  });

  it("returns a bounded visible tile set around the current screen view", () => {
    const camera = createCamera(3, 16 / 9);

    const coordinates = computeVisibleTileCoordinates({
      camera,
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      zoom: 3
    });

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.length).toBeLessThan(32);
    expect(coordinates.some((coordinate) => coordinate.x === 4 && coordinate.y === 4)).toBe(true);
  });
});
