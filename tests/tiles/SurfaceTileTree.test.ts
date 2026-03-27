import { PerspectiveCamera } from "three";
import { cartographicToCartesian } from "../../src/geo/projection";
import { selectSurfaceTileCoordinates } from "../../src/tiles/SurfaceTileTree";

function createCamera(distance: number, aspect = 16 / 9): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createOrbitCamera(
  lng: number,
  lat: number,
  altitude: number,
  radius: number,
  aspect = 16 / 9
): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 1000);
  const cartesian = cartographicToCartesian(
    {
      lng,
      lat,
      height: altitude
    },
    radius
  );
  camera.position.set(cartesian.x, cartesian.y, cartesian.z);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe("SurfaceTileTree", () => {
  it("selects deeper visible surface tiles as the camera moves closer", () => {
    const farSelection = selectSurfaceTileCoordinates({
      camera: createCamera(4.5),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 1,
      maxZoom: 8
    });
    const nearSelection = selectSurfaceTileCoordinates({
      camera: createCamera(1.4),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 1,
      maxZoom: 8
    });

    expect(nearSelection.zoom).toBeGreaterThan(farSelection.zoom);
    expect(nearSelection.coordinates.length).toBeGreaterThan(0);
  });

  it("returns a bounded visible leaf set instead of the full world", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createCamera(2.2),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 1,
      maxZoom: 6
    });

    expect(selection.coordinates.length).toBeGreaterThan(0);
    expect(selection.coordinates.length).toBeLessThan(64);
    expect(selection.coordinates.every((coordinate) => coordinate.z >= selection.zoom)).toBe(true);
    expect(selection.coordinates.every((coordinate) => coordinate.z <= selection.zoom + 1)).toBe(true);
  });

  it("builds a mixed lod leaf set without keeping parent tiles under refined children", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(110, 28, 0.25, 1),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 3,
      maxZoom: 9
    });
    const keySet = new Set(
      selection.coordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
    );
    const hasDetailedTiles = selection.coordinates.some((coordinate) => coordinate.z > selection.zoom);

    expect(hasDetailedTiles).toBe(true);

    for (const coordinate of selection.coordinates) {
      if (coordinate.z <= selection.zoom) {
        continue;
      }

      const parent = {
        z: coordinate.z - 1,
        x: Math.floor(coordinate.x / 2),
        y: Math.floor(coordinate.y / 2)
      };
      expect(keySet.has(`${parent.z}/${parent.x}/${parent.y}`)).toBe(false);
    }
  });

  it("diagnoses near-zoom tile counts for the default demo view", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(110, 28, 0.2, 1),
      viewportWidth: 706,
      viewportHeight: 418,
      radius: 1,
      tileSize: 256,
      minZoom: 3,
      maxZoom: 8
    });

    console.log("near-default-selection", selection.zoom, selection.coordinates.length);
    expect(selection.coordinates.length).toBeGreaterThan(0);
  });

  it("diagnoses near-zoom tile counts for a polar view", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(0, 82, 0.2, 1),
      viewportWidth: 706,
      viewportHeight: 418,
      radius: 1,
      tileSize: 256,
      minZoom: 3,
      maxZoom: 8
    });

    console.log("near-polar-selection", selection.zoom, selection.coordinates.length);
    expect(selection.coordinates.length).toBeGreaterThan(0);
  });

  it("diagnoses cumulative tile churn while zooming into the default demo view", () => {
    const uniqueKeys = new Set<string>();
    let previousKey = "";
    let selectionChanges = 0;

    for (let step = 0; step <= 40; step += 1) {
      const altitude = 2.4 - (2.2 * step) / 40;
      const selection = selectSurfaceTileCoordinates({
        camera: createOrbitCamera(110, 28, altitude, 1),
        viewportWidth: 706,
        viewportHeight: 418,
        radius: 1,
        tileSize: 256,
        minZoom: 3,
        maxZoom: 8
      });
      const key = selection.coordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`).join("|");

      if (key !== previousKey) {
        selectionChanges += 1;
        previousKey = key;
      }

      for (const coordinate of selection.coordinates) {
        uniqueKeys.add(`${coordinate.z}/${coordinate.x}/${coordinate.y}`);
      }
    }

    console.log("zoom-churn", {
      uniqueTiles: uniqueKeys.size,
      selectionChanges
    });
    expect(uniqueKeys.size).toBeGreaterThan(0);
  });
});
