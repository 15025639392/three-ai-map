import { PerspectiveCamera, Scene } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { TerrainTileLayer, type ElevationTileData } from "../../src/layers/TerrainTileLayer";
import type { LayerContext } from "../../src/layers/Layer";
import type { SurfaceTilePlan } from "../../src/tiles/SurfaceTilePlanner";
import type { TileCoordinate } from "../../src/tiles/TileViewport";

function tileKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function parentKeyFor(coordinate: TileCoordinate): string | null {
  if (coordinate.z === 0) {
    return null;
  }

  return tileKey({
    z: coordinate.z - 1,
    x: Math.floor(coordinate.x / 2),
    y: Math.floor(coordinate.y / 2)
  });
}

function createSurfaceTilePlan(
  coordinates: TileCoordinate[],
  interactionPhase: SurfaceTilePlan["interactionPhase"] = "idle"
): SurfaceTilePlan {
  const targetZoom = coordinates.reduce(
    (minZoom, coordinate) => Math.min(minZoom, coordinate.z),
    coordinates[0]?.z ?? 0
  );

  return {
    targetZoom,
    centerCoordinate: coordinates[0] ?? { z: 0, x: 0, y: 0 },
    interactionPhase,
    nodes: coordinates.map((coordinate, index) => ({
      key: tileKey(coordinate),
      coordinate,
      parentKey: parentKeyFor(coordinate),
      priority: coordinates.length - index,
      wantedState: "leaf",
      interactionPhase
    }))
  };
}

function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  camera.position.set(2.5, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createContext(getSurfaceTilePlan: () => SurfaceTilePlan): LayerContext {
  const rendererElement = document.createElement("canvas");
  Object.defineProperty(rendererElement, "clientWidth", { value: 800 });
  Object.defineProperty(rendererElement, "clientHeight", { value: 600 });

  return {
    scene: new Scene(),
    camera: createCamera(),
    globe: new GlobeMesh({ radius: 1 }),
    radius: 1,
    rendererElement,
    requestRender: vi.fn(),
    getSurfaceTilePlan
  };
}

function createElevationTileData(): ElevationTileData {
  return {
    width: 2,
    height: 2,
    data: new Float32Array(4)
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("TerrainTileLayer shared plan geometry", () => {
  it("keeps the parent tile visible until the selected child geometry is ready", async () => {
    const parentCoordinate = { z: 1, x: 0, y: 0 };
    const childCoordinate = { z: 2, x: 0, y: 0 };
    const childTile = createDeferred<ElevationTileData>();
    let currentPlan = createSurfaceTilePlan([parentCoordinate], "idle");
    const context = createContext(() => currentPlan);
    const layer = new TerrainTileLayer("terrain", {
      terrain: {
        tiles: ["memory://terrain/{z}/{x}/{y}.png"],
        encode: "terrarium",
        minZoom: 0,
        maxZoom: 8
      },
      selectTiles: () => ({
        zoom: currentPlan.targetZoom,
        coordinates: currentPlan.nodes.map((node) => node.coordinate)
      }),
      loadElevationTile: async (coordinate) => {
        if (coordinate.z === childCoordinate.z) {
          return childTile.promise;
        }

        return createElevationTileData();
      }
    });

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);

    expect(layer.getActiveTileKeys()).toEqual(["1/0/0"]);
    expect(layer.getActiveTileMesh("1/0/0")).not.toBeNull();

    currentPlan = createSurfaceTilePlan([childCoordinate], "idle");
    layer.update(0, context);
    await flushMicrotasks();

    expect(layer.getActiveTileKeys()).toEqual(["1/0/0"]);
    expect(layer.getActiveTileMesh("1/0/0")).not.toBeNull();
    expect(layer.getActiveTileMesh("2/0/0")).toBeNull();

    childTile.resolve(createElevationTileData());
    await layer.ready();
    layer.update(0, context);
    await flushMicrotasks();

    expect(layer.getActiveTileKeys()).toEqual(["2/0/0"]);
    expect(layer.getActiveTileMesh("2/0/0")).not.toBeNull();
    expect(layer.getActiveTileMesh("1/0/0")).toBeNull();

    layer.onRemove(context);
    layer.dispose();
  });

  it("keeps the parent tile visible until all selected siblings under that parent are ready", async () => {
    const parentCoordinate = { z: 1, x: 0, y: 0 };
    const leftChildCoordinate = { z: 2, x: 0, y: 0 };
    const rightChildCoordinate = { z: 2, x: 1, y: 0 };
    const rightChildTile = createDeferred<ElevationTileData>();
    let currentPlan = createSurfaceTilePlan([parentCoordinate], "idle");
    const context = createContext(() => currentPlan);
    const layer = new TerrainTileLayer("terrain", {
      terrain: {
        tiles: ["memory://terrain/{z}/{x}/{y}.png"],
        encode: "terrarium",
        minZoom: 0,
        maxZoom: 8
      },
      selectTiles: () => ({
        zoom: currentPlan.targetZoom,
        coordinates: currentPlan.nodes.map((node) => node.coordinate)
      }),
      loadElevationTile: async (coordinate) => {
        if (coordinate.x === rightChildCoordinate.x && coordinate.y === rightChildCoordinate.y) {
          return rightChildTile.promise;
        }

        return createElevationTileData();
      }
    });

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);

    currentPlan = createSurfaceTilePlan([leftChildCoordinate, rightChildCoordinate], "idle");
    layer.update(0, context);
    await flushMicrotasks();
    layer.update(0, context);
    await flushMicrotasks();

    expect(layer.getActiveTileKeys()).toEqual(["1/0/0"]);
    expect(layer.getActiveTileMesh("1/0/0")).not.toBeNull();
    expect(layer.getActiveTileMesh("2/0/0")).toBeNull();

    rightChildTile.resolve(createElevationTileData());
    await layer.ready();
    layer.update(0, context);
    await flushMicrotasks();

    expect(layer.getActiveTileKeys()).toEqual(["2/0/0", "2/1/0"]);
    expect(layer.getActiveTileMesh("1/0/0")).toBeNull();

    layer.onRemove(context);
    layer.dispose();
  });
});
