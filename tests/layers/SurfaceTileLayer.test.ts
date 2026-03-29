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
import * as surfaceTileTree from "../../src/tiles/SurfaceTileTree";
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

  it("aborts stale imagery requests when tile selection changes", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    let visibleTiles: TileCoordinate[] = [{ z: 2, x: 2, y: 1 }];
    const staleImageryAborts: unknown[] = [];
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: visibleTiles
      }),
      loadImageryTile: async (coordinate, signal?: AbortSignal) => {
        if (coordinate.x === 2) {
          return new Promise<HTMLCanvasElement>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                staleImageryAborts.push(signal.reason);
                reject(signal.reason);
              },
              { once: true }
            );
          });
        }

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
      rendererElement
    };

    layer.onAdd(context);
    visibleTiles = [{ z: 2, x: 3, y: 1 }];
    layer.update(0, context);
    await layer.ready();

    expect(staleImageryAborts).toHaveLength(1);
  });

  it("aborts stale elevation requests when tile selection changes", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    let visibleTiles: TileCoordinate[] = [{ z: 2, x: 2, y: 1 }];
    const staleElevationAborts: unknown[] = [];
    const staleElevationStarted = createDeferred<void>();
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
      loadElevationTile: async (coordinate, signal?: AbortSignal) => {
        if (coordinate.x === 2) {
          return new Promise<ElevationTileData>((_resolve, reject) => {
            staleElevationStarted.resolve();
            signal?.addEventListener(
              "abort",
              () => {
                staleElevationAborts.push(signal.reason);
                reject(signal.reason);
              },
              { once: true }
            );
          });
        }

        return createElevationTile(1200);
      }
    });
    const context = {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    };

    layer.onAdd(context);
    await staleElevationStarted.promise;
    visibleTiles = [{ z: 2, x: 3, y: 1 }];
    layer.update(0, context);
    await layer.ready();

    expect(staleElevationAborts).toHaveLength(1);
  });

  it("exposes scheduler debug stats for imagery and elevation requests", async () => {
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
      loadImageryTile: async (coordinate, signal?: AbortSignal) => {
        if (coordinate.x === 2) {
          return new Promise<HTMLCanvasElement>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true }
            );
          });
        }

        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
      loadElevationTile: async () => createElevationTile(1200)
    });
    const typedLayer = layer as SurfaceTileLayer & {
      getDebugStats: () => {
        activeTileCount: number;
        imagery: { requested: number; cancelled: number; succeeded: number };
        elevation: { requested: number; cancelled: number; succeeded: number };
      };
    };
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
    await layer.ready();

    expect(typedLayer.getDebugStats()).toMatchObject({
      activeTileCount: 1,
      imagery: {
        requested: 2,
        cancelled: 1,
        succeeded: 1
      },
      elevation: {
        requested: 1,
        cancelled: 0,
        succeeded: 1
      }
    });
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

  it("recomputes default tile selection when viewport size changes without moving the camera", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const selectTilesSpy = vi
      .spyOn(surfaceTileTree, "selectSurfaceTileCoordinates")
      .mockReturnValue({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      });
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
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
      rendererElement
    };

    layer.onAdd(context);
    await layer.ready();

    Object.defineProperty(rendererElement, "clientWidth", { value: 1440, configurable: true });
    layer.update(0, context);
    await layer.ready();

    expect(selectTilesSpy).toHaveBeenCalledTimes(2);
    selectTilesSpy.mockRestore();
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
      expect.objectContaining({ z: 2, x: 3, y: 1 }),
      expect.any(AbortSignal)
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
    expect(radius).toBeCloseTo(1.001, 3); // Accept TILE_DEPTH_OFFSET = 0.001
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
  it("reports tile load failures through LayerContext.reportError", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const loadError = new Error("imagery failed");
    const reportError = vi.fn();
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        throw loadError;
      },
      loadElevationTile: async () => createElevationTile(1200)
    });
    const context = {
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement,
      reportError
    };

    layer.onAdd(context);
    await layer.ready();

    expect(reportError).toHaveBeenCalledTimes(1);
    const payload = reportError.mock.calls[0][0] as {
      source: string;
      layerId: string;
      stage: string;
      category: string;
      severity: string;
      tileKey?: string;
      metadata?: {
        tileKey?: string;
        coordinate?: { z: number; x: number; y: number };
      };
      recoverable: boolean;
      error: Error;
    };

    expect(payload.source).toBe("layer");
    expect(payload.layerId).toBe("surface-tiles");
    expect(payload.recoverable).toBe(true);
    expect(payload.stage).toBe("imagery");
    expect(payload.category).toBe("network");
    expect(payload.severity).toBe("warn");
    expect(payload.tileKey ?? payload.metadata?.tileKey).toBe("2/2/1");
    expect(payload.metadata?.coordinate).toEqual({ z: 2, x: 2, y: 1 });
    expect(payload.error).toBe(loadError);
  });

  it("retries imagery requests and succeeds before exhausting retry budget", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const reportError = vi.fn();
    let attempt = 0;
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      imageryRetryAttempts: 2,
      imageryRetryDelayMs: 0,
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        attempt += 1;

        if (attempt < 3) {
          throw new Error(`transient imagery error ${attempt}`);
        }

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
      rendererElement,
      reportError
    });
    await layer.ready();

    expect(attempt).toBe(3);
    expect(reportError).not.toHaveBeenCalled();
    expect(layer.getActiveTileKeys()).toEqual(["2/2/1"]);
  });

  it("falls back to solid color imagery after retry exhaustion", async () => {
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = createCamera(2.2);
    const reportError = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        return {
          fillStyle: "",
          fillRect: vi.fn()
        } as unknown as CanvasRenderingContext2D;
      });
    let attempt = 0;
    const layer = new SurfaceTileLayer("surface-tiles", {
      minZoom: 1,
      maxZoom: 6,
      meshSegments: 2,
      imageryRetryAttempts: 1,
      imageryRetryDelayMs: 0,
      imageryFallbackColor: "#ff00ff",
      selectTiles: () => ({
        zoom: 2,
        coordinates: [{ z: 2, x: 2, y: 1 }]
      }),
      loadImageryTile: async () => {
        attempt += 1;
        throw new Error(`permanent imagery error ${attempt}`);
      },
      loadElevationTile: async () => createElevationTile(1200)
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement,
      reportError
    });
    try {
      await layer.ready();

      expect(attempt).toBe(2);
      expect(layer.getActiveTileKeys()).toEqual(["2/2/1"]);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
        source: "layer",
        layerId: "surface-tiles",
        stage: "imagery",
        category: "network",
        severity: "warn",
        recoverable: true,
        tileKey: "2/2/1",
        metadata: expect.objectContaining({
          attempts: 2,
          fallbackUsed: true
        })
      }));
    } finally {
      getContext.mockRestore();
    }
  });
});
