import { PerspectiveCamera, Scene } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import {
  ElevationTileData,
  SurfaceTileLayer
} from "../../src/layers/SurfaceTileLayer";
import { TileCoordinate } from "../../src/tiles/TileViewport";

function createRendererElement(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  return element;
}

function createCamera(distance: number, aspect = 16 / 9): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createElevationTile(value: number): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([value, value, value, value])
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("SurfaceTileLayer", () => {
  it("creates curved surface meshes for selected globe tiles and swaps lifecycle with visibility", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    let visibleTiles: TileCoordinate[] = [{ z: 2, x: 2, y: 1 }];
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: visibleTiles
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(1200)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    expect(scene.children.some((child) => child.name === "surface-tiles")).toBe(true);
    expect(layer.getActiveTileKeys()).toEqual(["2/2/1"]);

    visibleTiles = [{ z: 2, x: 3, y: 1 }];
    layer.update(0, {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    expect(layer.getActiveTileKeys()).toEqual(["2/3/1"]);
  });

  it("does not rebuild the same pending ready aggregation on every update while the selection is unchanged", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const imageryDeferred = createDeferred<HTMLCanvasElement>();
    const elevationDeferred = createDeferred<ElevationTileData>();
    const allSettledSpy = vi.spyOn(Promise, "allSettled");
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => imageryDeferred.promise,
      loadElevationTile: async () => elevationDeferred.promise
    });
    const context = {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    };

    layer.onAdd(context);
    layer.update(0, context);
    layer.update(0, context);

    expect(allSettledSpy).toHaveBeenCalledTimes(1);

    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    imageryDeferred.resolve(canvas);
    elevationDeferred.resolve(createElevationTile(1200));
    await layer.ready();
    allSettledSpy.mockRestore();
  });

  it("batches render invalidation when a zoom change removes multiple surface tiles", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const requestRender = vi.fn();
    let visibleTiles: TileCoordinate[] = [
      { z: 2, x: 2, y: 1 },
      { z: 2, x: 3, y: 1 },
      { z: 2, x: 4, y: 1 }
    ];
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: visibleTiles
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(1200)
    });
    const context = {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement,
      requestRender
    };

    layer.onAdd(context);
    await layer.ready();
    requestRender.mockClear();

    visibleTiles = [{ z: 2, x: 6, y: 1 }];
    layer.update(0, context);
    await Promise.resolve();

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("does not continue into elevation work after a tile is deselected while imagery is still loading", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    let visibleTiles: TileCoordinate[] = [{ z: 2, x: 2, y: 1 }];
    const imageryDeferredByKey = new Map<string, ReturnType<typeof createDeferred<HTMLCanvasElement>>>();
    const elevationLoader = vi.fn(async () => createElevationTile(800));
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: visibleTiles
      }),
      loadImageryTile: async (coordinate) => {
        const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
        const deferred = createDeferred<HTMLCanvasElement>();
        imageryDeferredByKey.set(key, deferred);
        return deferred.promise;
      },
      loadElevationTile: elevationLoader
    });
    const context = {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    };

    layer.onAdd(context);
    visibleTiles = [{ z: 2, x: 3, y: 1 }];
    layer.update(0, context);

    const staleCanvas = document.createElement("canvas");
    staleCanvas.width = 2;
    staleCanvas.height = 2;
    imageryDeferredByKey.get("2/2/1")?.resolve(staleCanvas);

    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = 2;
    nextCanvas.height = 2;
    imageryDeferredByKey.get("2/3/1")?.resolve(nextCanvas);
    await layer.ready();

    expect(elevationLoader).toHaveBeenCalledTimes(1);
    expect(elevationLoader).toHaveBeenCalledWith(
      expect.objectContaining({ z: 2, x: 3, y: 1 })
    );
  });
});
