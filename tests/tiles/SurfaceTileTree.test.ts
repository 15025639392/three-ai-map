import { PerspectiveCamera } from "three";
import { cartographicToCartesian } from "../../src/geo/projection";
import { selectSurfaceTileCoordinates } from "../../src/tiles/SurfaceTileTree";
import { computeVisibleTileCoordinates, TileCoordinate } from "../../src/tiles/TileViewport";

function coordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function expandCoordinates(coordinates: TileCoordinate[], padding: number): TileCoordinate[] {
  if (padding <= 0 || coordinates.length === 0) {
    return coordinates;
  }

  const expanded: TileCoordinate[] = [];

  for (const coordinate of coordinates) {
    const worldTileCount = 2 ** coordinate.z;

    for (let dy = -padding; dy <= padding; dy += 1) {
      const y = coordinate.y + dy;

      if (y < 0 || y >= worldTileCount) {
        continue;
      }

      for (let dx = -padding; dx <= padding; dx += 1) {
        expanded.push({
          z: coordinate.z,
          x: normalizeTileX(coordinate.x + dx, coordinate.z),
          y
        });
      }
    }
  }

  return expanded;
}

function uniqueSortedCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return [...new Map(coordinates.map((coordinate) => [coordinateKey(coordinate), coordinate])).values()]
    .sort((left, right) => {
      if (left.z !== right.z) {
        return left.z - right.z;
      }
      if (left.y !== right.y) {
        return left.y - right.y;
      }
      return left.x - right.x;
    });
}

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
    const minZoom = 3;
    const maxZoom = 8;
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(110, 28, 0.2, 1),
      viewportWidth: 706,
      viewportHeight: 418,
      radius: 1,
      tileSize: 256,
      minZoom,
      maxZoom
    });
    const keySet = new Set(
      selection.coordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
    );
    const hasDetailedTiles = selection.coordinates.some((coordinate) => coordinate.z > selection.zoom);
    const hasCoarseTiles = selection.coordinates.some((coordinate) => coordinate.z === selection.zoom);

    expect(hasDetailedTiles).toBe(true);
    expect(hasCoarseTiles).toBe(true);

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

    const lowMidZoom = selection.zoom <= minZoom + 1;
    const detailSampling = lowMidZoom
      ? { sampleColumns: 13, sampleRows: 11 }
      : { sampleColumns: 10, sampleRows: 8 };
    const uniformDetail = computeVisibleTileCoordinates({
      camera: createOrbitCamera(110, 28, 0.2, 1),
      viewportWidth: 706,
      viewportHeight: 418,
      radius: 1,
      zoom: Math.min(maxZoom, selection.zoom + 1),
      sampleColumns: detailSampling.sampleColumns,
      sampleRows: detailSampling.sampleRows
    });
    const paddedUniformDetail = uniqueSortedCoordinates(expandCoordinates(
      uniqueSortedCoordinates(uniformDetail),
      1
    ));

    console.log("near-default-mixed", {
      zoom: selection.zoom,
      mixedTiles: selection.coordinates.length,
      uniformTiles: paddedUniformDetail.length
    });
    expect(selection.coordinates.length).toBeLessThan(paddedUniformDetail.length);
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
    // Regression guard: polar views should stay bounded even after seam padding.
    expect(selection.coordinates.length).toBeLessThan(140);
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
    // Regression guard: mixed-LOD selection should not explode the tile churn while zooming.
    expect(uniqueKeys.size).toBeLessThan(650);
    expect(selectionChanges).toBeLessThan(50);
  });

  it("uses only max-zoom tiles near max zoom around the seam repro coordinate", () => {
    const maxZoom = 8;
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(-81.86, 39.07, 0.12, 1),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 1,
      maxZoom
    });
    const zoomLevels = [...new Set(selection.coordinates.map((coordinate) => coordinate.z))];

    expect(selection.zoom).toBeGreaterThanOrEqual(maxZoom - 1);
    expect(zoomLevels).toEqual([maxZoom]);
  });

  it("avoids mixed lod boundaries at low-mid zoom for seam-prone views", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(-48.425333, -2.33778, 1.724802, 1),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 3,
      maxZoom: 10
    });
    const zoomLevels = [...new Set(selection.coordinates.map((coordinate) => coordinate.z))];

    expect(selection.zoom).toBe(3);
    expect(zoomLevels).toEqual([4]);
    expect(selection.coordinates.length).toBeGreaterThan(16);
  });

  it("covers the mexico seam repro view without leaving holes across mixed lod", () => {
    const selection = selectSurfaceTileCoordinates({
      camera: createOrbitCamera(-103.570152, 24.712753, 0.246603, 1),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      tileSize: 256,
      minZoom: 3,
      maxZoom: 10
    });
    const zoomLevels = [...new Set(selection.coordinates.map((coordinate) => coordinate.z))];
    const selectionKeySet = new Set(selection.coordinates.map((coordinate) => coordinateKey(coordinate)));
    const detailZoom = selection.zoom + 1;

    expect(selection.zoom).toBe(6);
    expect(zoomLevels).toEqual(expect.arrayContaining([detailZoom]));
    expect(zoomLevels.length).toBeLessThanOrEqual(2);
    expect(selection.coordinates.length).toBeGreaterThan(45);

    for (const coordinate of selection.coordinates) {
      if (coordinate.z !== detailZoom) {
        continue;
      }

      const parent = {
        z: coordinate.z - 1,
        x: Math.floor(coordinate.x / 2),
        y: Math.floor(coordinate.y / 2)
      };
      expect(selectionKeySet.has(coordinateKey(parent))).toBe(false);
    }

    const baseVisible = computeVisibleTileCoordinates({
      camera: createOrbitCamera(-103.570152, 24.712753, 0.246603, 1),
      viewportWidth: 1280,
      viewportHeight: 720,
      radius: 1,
      zoom: selection.zoom,
      sampleColumns: 9,
      sampleRows: 7
    });
    const basePadded = uniqueSortedCoordinates(expandCoordinates(
      uniqueSortedCoordinates(baseVisible),
      1
    ));

    for (const parent of basePadded) {
      const parentKey = coordinateKey(parent);

      if (selectionKeySet.has(parentKey)) {
        continue;
      }

      const children = [
        { z: detailZoom, x: normalizeTileX(parent.x * 2, detailZoom), y: parent.y * 2 },
        { z: detailZoom, x: normalizeTileX(parent.x * 2 + 1, detailZoom), y: parent.y * 2 },
        { z: detailZoom, x: normalizeTileX(parent.x * 2, detailZoom), y: parent.y * 2 + 1 },
        { z: detailZoom, x: normalizeTileX(parent.x * 2 + 1, detailZoom), y: parent.y * 2 + 1 }
      ];

      for (const child of children) {
        expect(selectionKeySet.has(coordinateKey(child))).toBe(true);
      }
    }
  });
});
