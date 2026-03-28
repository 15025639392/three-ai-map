import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene
} from "three";
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

function getFirstVertexRadius(scene: Scene, layerId: string): number | null {
  const group = scene.getObjectByName(layerId);
  const mesh = group?.children[0] as Mesh | undefined;
  const positions = mesh
    ? (mesh.geometry.getAttribute("position").array as Float32Array)
    : null;

  if (!positions) {
    return null;
  }

  const x = positions[0];
  const y = positions[1];
  const z = positions[2];
  return Math.sqrt(x * x + y * y + z * z);
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

  it("drapes imagery mesh directly on terrain geometry by default", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      elevationExaggeration: 1,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(0)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    const radius = getFirstVertexRadius(scene, "surface-tiles");
    expect(radius).not.toBeNull();

    if (radius === null) {
      return;
    }
    expect(radius).toBeCloseTo(1, 6);
  });

  it("adds skirt vertices to hide seams between neighboring or mixed lod tiles", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      skirtDepthMeters: 800,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(100)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    const group = scene.getObjectByName("surface-tiles");
    const mesh = group?.children[0] as Mesh | undefined;
    const positionCount = mesh?.geometry.getAttribute("position").count ?? 0;
    const expectedGridVertexCount = (1 + 1) * (1 + 1);

    expect(positionCount).toBeGreaterThan(expectedGridVertexCount);
  });

  it("does not create skirts on shared edges between adjacent same-zoom tiles", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      skirtDepthMeters: 800,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [
          { z: 2, x: 2, y: 1 },
          { z: 2, x: 3, y: 1 }
        ]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(100)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    const group = scene.getObjectByName("surface-tiles");
    const leftMesh = group?.getObjectByName("2/2/1") as Mesh | undefined;
    const rightMesh = group?.getObjectByName("2/3/1") as Mesh | undefined;
    const leftCount = leftMesh?.geometry.getAttribute("position").count ?? 0;
    const rightCount = rightMesh?.geometry.getAttribute("position").count ?? 0;

    // meshSegments=1 -> base grid has 4 vertices, each skirted edge adds 2 vertices.
    // Shared edge should not receive skirt, so 3 edges -> 4 + 3*2 = 10.
    expect(leftCount).toBe(10);
    expect(rightCount).toBe(10);
  });

  it("increases terrain relief at higher zoom when zoomExaggerationBoost is enabled", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const camera = createCamera(2.2);
    const baseConfig = {
      minZoom: 1,
      maxZoom: 8,
      meshSegments: 1,
      elevationExaggeration: 1,
      zoomExaggerationBoost: 2,
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(1000)
    };

    const lowZoomScene = new Scene();
    const lowZoomLayer = new SurfaceTileLayer("surface-low", {
      ...baseConfig,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      })
    });
    lowZoomLayer.onAdd({
      scene: lowZoomScene,
      camera,
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1,
      rendererElement
    });
    await lowZoomLayer.ready();
    const lowRadius = getFirstVertexRadius(lowZoomScene, "surface-low");

    const highZoomScene = new Scene();
    const highZoomLayer = new SurfaceTileLayer("surface-high", {
      ...baseConfig,
      selectTiles: () => ({
        zoom: 8,
        coordinates: [{ z: 8, x: 180, y: 100 }]
      })
    });
    highZoomLayer.onAdd({
      scene: highZoomScene,
      camera,
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1,
      rendererElement
    });
    await highZoomLayer.ready();
    const highRadius = getFirstVertexRadius(highZoomScene, "surface-high");

    expect(lowRadius).not.toBeNull();
    expect(highRadius).not.toBeNull();

    if (lowRadius === null || highRadius === null) {
      return;
    }

    expect(highRadius).toBeGreaterThan(lowRadius);
  });

  it("configures anti-seam texture sampling for imagery tiles", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(0)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    const group = scene.getObjectByName("surface-tiles");
    const mesh = group?.children[0] as Mesh | undefined;
    const material = mesh?.material as MeshStandardMaterial | undefined;
    const texture = material?.map;

    expect(texture).toBeDefined();
    expect(texture?.generateMipmaps).toBe(false);
    expect(texture?.minFilter).toBe(LinearFilter);
    expect(texture?.magFilter).toBe(LinearFilter);
    expect(texture?.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture?.wrapT).toBe(ClampToEdgeWrapping);
  });

  it("applies default half-pixel uv inset to reduce edge sampling seams", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(0)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });
    await layer.ready();

    const group = scene.getObjectByName("surface-tiles");
    const mesh = group?.children[0] as Mesh | undefined;
    const uvArray = mesh?.geometry.getAttribute("uv").array as Float32Array | undefined;

    expect(uvArray).toBeDefined();

    if (!uvArray) {
      return;
    }

    const inset = 0.5 / 256;
    expect(uvArray[0]).toBeCloseTo(inset, 6);
    expect(uvArray[1]).toBeCloseTo(1 - inset, 6);
  });

  it("offsets vertex positions when coordTransform is provided", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const noTransformScene = new Scene();
    const noTransformGlobe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const sharedOptions = {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 1,
      elevationExaggeration: 0,
      skirtDepthMeters: 0,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(0)
    };

    const noTransformLayer = new SurfaceTileLayer("no-transform", sharedOptions);
    noTransformLayer.onAdd({
      scene: noTransformScene,
      camera,
      globe: noTransformGlobe,
      radius: 1,
      rendererElement
    });
    await noTransformLayer.ready();

    const shift = 0.01; // ~1km offset in degrees
    const transformLayer = new SurfaceTileLayer("with-transform", {
      ...sharedOptions,
      coordTransform: (lng, lat) => ({ lng: lng + shift, lat: lat + shift })
    });
    const transformScene = new Scene();
    transformLayer.onAdd({
      scene: transformScene,
      camera,
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1,
      rendererElement
    });
    await transformLayer.ready();

    const getPositions = (scene: Scene, id: string) => {
      const group = scene.getObjectByName(id);
      const mesh = group?.children[0] as Mesh | undefined;
      return mesh?.geometry.getAttribute("position").array as Float32Array | undefined;
    };

    const noTransformPos = getPositions(noTransformScene, "no-transform");
    const transformPos = getPositions(transformScene, "with-transform");

    expect(noTransformPos).toBeDefined();
    expect(transformPos).toBeDefined();

    if (!noTransformPos || !transformPos) {
      return;
    }

    // Positions should differ because coordTransform shifts lng/lat
    expect(transformPos[0]).not.toBeCloseTo(noTransformPos[0], 5);
    // UVs should remain the same (coordTransform does not affect UVs)
    const noTransformUv = (noTransformScene.getObjectByName("no-transform")
      ?.children[0] as Mesh | undefined)?.geometry.getAttribute("uv").array as Float32Array | undefined;
    const transformUv = (transformScene.getObjectByName("with-transform")
      ?.children[0] as Mesh | undefined)?.geometry.getAttribute("uv").array as Float32Array | undefined;
    if (noTransformUv && transformUv) {
      expect(transformUv[0]).toBeCloseTo(noTransformUv[0], 6);
      expect(transformUv[1]).toBeCloseTo(noTransformUv[1], 6);
    }
  });
});
