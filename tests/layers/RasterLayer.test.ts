import {
  type BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene
} from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import type { LayerContext } from "../../src/layers/Layer";
import { RasterLayer } from "../../src/layers/RasterLayer";
import type { TerrainTileHost } from "../../src/layers/TerrainTileHost";
import { RasterTileSource } from "../../src/sources/RasterTileSource";
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
  camera.position.set(1.05, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createRendererElement(): HTMLCanvasElement {
  const rendererElement = document.createElement("canvas");
  Object.defineProperty(rendererElement, "clientWidth", { value: 800 });
  Object.defineProperty(rendererElement, "clientHeight", { value: 600 });
  return rendererElement;
}

function createTileSourceCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  return canvas;
}

function createCanvasRenderingContextStub(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true
  } as unknown as CanvasRenderingContext2D;
}

class FakeTerrainHost implements TerrainTileHost {
  private readonly meshes = new Map<string, Mesh<BufferGeometry, MeshStandardMaterial>>();

  constructor(activeCoordinates: TileCoordinate[]) {
    for (const coordinate of activeCoordinates) {
      this.meshes.set(
        tileKey(coordinate),
        new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial())
      );
    }
  }

  getActiveTileKeys(): string[] {
    return [...this.meshes.keys()].sort();
  }

  getActiveTileMesh(key: string): Mesh<BufferGeometry, MeshStandardMaterial> | null {
    return this.meshes.get(key) ?? null;
  }
}

function getRasterActiveTile(
  layer: RasterLayer,
  key: string
): {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  requestedImageryTileKeys: string[];
} | undefined {
  const activeTiles = Reflect.get(layer as object, "activeTiles") as Map<string, {
    mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
    requestedImageryTileKeys: string[];
  }>;

  return activeTiles.get(key);
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();

  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function createContext(options: {
  source: RasterTileSource;
  host: TerrainTileHost;
  getSurfaceTilePlan: () => SurfaceTilePlan;
}): LayerContext {
  return {
    scene: new Scene(),
    camera: createCamera(),
    globe: new GlobeMesh({ radius: 1 }),
    radius: 1,
    rendererElement: createRendererElement(),
    requestRender: vi.fn(),
    getSource: () => options.source,
    getTerrainHost: () => options.host,
    getSurfaceTilePlan: options.getSurfaceTilePlan
  };
}

describe("RasterLayer shared plan integration", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      createCanvasRenderingContextStub()
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests only shared-plan leaf imagery plus parent fallback during interaction", async () => {
    const hostCoordinate = { z: 1, x: 0, y: 0 };
    const sharedLeafCoordinates = [
      { z: 2, x: 0, y: 0 },
      { z: 2, x: 1, y: 0 }
    ];
    const requestLog: string[] = [];
    const source = new RasterTileSource("raster", {
      tiles: ["memory://raster/{z}/{x}/{y}.png"],
      maxZoom: 18,
      loadTile: async (coordinate) => {
        requestLog.push(tileKey(coordinate));
        return createTileSourceCanvas();
      }
    });
    source.onAdd?.({ requestRender: vi.fn() });
    const context = createContext({
      source,
      host: new FakeTerrainHost([hostCoordinate]),
      getSurfaceTilePlan: () => createSurfaceTilePlan(sharedLeafCoordinates, "interacting")
    });
    const layer = new RasterLayer({ id: "raster", source: "raster" });

    layer.onAdd(context);
    layer.update(0, context);

    await waitUntil(() => requestLog.length >= 3);
    await flushMicrotasks();

    expect([...new Set(requestLog)].sort()).toEqual(["1/0/0", "2/0/0", "2/1/0"]);

    layer.onRemove(context);
    layer.dispose();
    source.onRemove?.();
    source.dispose?.();
  });

  it("keeps mixed-depth shared imagery nodes instead of dropping coarse siblings", async () => {
    const hostCoordinate = { z: 1, x: 0, y: 0 };
    const mixedSharedCoordinates = [
      { z: 2, x: 0, y: 0 },
      { z: 2, x: 0, y: 1 },
      { z: 2, x: 1, y: 1 },
      { z: 3, x: 2, y: 0 },
      { z: 3, x: 3, y: 0 },
      { z: 3, x: 2, y: 1 },
      { z: 3, x: 3, y: 1 }
    ];
    const requestLog: string[] = [];
    const source = new RasterTileSource("raster", {
      tiles: ["memory://raster/{z}/{x}/{y}.png"],
      maxZoom: 18,
      loadTile: async (coordinate) => {
        requestLog.push(tileKey(coordinate));
        return createTileSourceCanvas();
      }
    });
    source.onAdd?.({ requestRender: vi.fn() });
    const context = createContext({
      source,
      host: new FakeTerrainHost([hostCoordinate]),
      getSurfaceTilePlan: () => createSurfaceTilePlan(mixedSharedCoordinates, "idle")
    });
    const layer = new RasterLayer({ id: "raster", source: "raster" });

    layer.onAdd(context);
    layer.update(0, context);

    await waitUntil(() => requestLog.length >= 8);
    await flushMicrotasks();

    expect([...new Set(requestLog)].sort()).toEqual([
      "1/0/0",
      "2/0/0",
      "2/0/1",
      "2/1/1",
      "3/2/0",
      "3/2/1",
      "3/3/0",
      "3/3/1"
    ]);

    layer.onRemove(context);
    layer.dispose();
    source.onRemove?.();
    source.dispose?.();
  });

  it("renders parent imagery fallback while shared leaf detail is still pending", async () => {
    const hostCoordinate = { z: 1, x: 0, y: 0 };
    const sharedLeafCoordinate = { z: 2, x: 0, y: 0 };
    let resolveLeaf!: () => void;
    const leafPromise = new Promise<void>((resolve) => {
      resolveLeaf = resolve;
    });
    const requestLog: string[] = [];
    const source = new RasterTileSource("raster", {
      tiles: ["memory://raster/{z}/{x}/{y}.png"],
      maxZoom: 18,
      loadTile: async (coordinate) => {
        requestLog.push(tileKey(coordinate));

        if (coordinate.z === sharedLeafCoordinate.z) {
          await leafPromise;
        }

        return createTileSourceCanvas();
      }
    });
    source.onAdd?.({ requestRender: vi.fn() });
    const context = createContext({
      source,
      host: new FakeTerrainHost([hostCoordinate]),
      getSurfaceTilePlan: () => createSurfaceTilePlan([sharedLeafCoordinate], "idle")
    });
    const layer = new RasterLayer({ id: "raster", source: "raster" });

    layer.onAdd(context);
    layer.update(0, context);

    const getEntry = () => getRasterActiveTile(layer, "1/0/0");

    await waitUntil(() => requestLog.includes("1/0/0"));
    await waitUntil(() => getEntry()?.mesh !== null);
    await flushMicrotasks();

    const entry = getEntry();

    expect(entry?.mesh).not.toBeNull();
    expect(entry?.requestedImageryTileKeys).toEqual(["1/0/0", "2/0/0"]);

    resolveLeaf();
    await waitUntil(() => requestLog.includes("2/0/0"));

    layer.onRemove(context);
    layer.dispose();
    source.onRemove?.();
    source.dispose?.();
  });

  it("clamps shared imagery detail to the raster source max zoom instead of dropping it", async () => {
    const hostCoordinate = { z: 1, x: 0, y: 0 };
    const cappedSharedCoordinates = [
      { z: 3, x: 2, y: 0 },
      { z: 3, x: 3, y: 0 },
      { z: 3, x: 2, y: 1 },
      { z: 3, x: 3, y: 1 }
    ];
    const requestLog: string[] = [];
    const source = new RasterTileSource("raster", {
      tiles: ["memory://raster/{z}/{x}/{y}.png"],
      maxZoom: 2,
      loadTile: async (coordinate) => {
        requestLog.push(tileKey(coordinate));
        return createTileSourceCanvas();
      }
    });
    source.onAdd?.({ requestRender: vi.fn() });
    const context = createContext({
      source,
      host: new FakeTerrainHost([hostCoordinate]),
      getSurfaceTilePlan: () => createSurfaceTilePlan(cappedSharedCoordinates, "idle")
    });
    const layer = new RasterLayer({ id: "raster", source: "raster" });

    layer.onAdd(context);
    layer.update(0, context);

    await waitUntil(() => requestLog.length >= 2);
    await flushMicrotasks();

    expect([...new Set(requestLog)].sort()).toEqual(["1/0/0", "2/1/0"]);
    expect(getRasterActiveTile(layer, "1/0/0")?.requestedImageryTileKeys).toEqual(["1/0/0", "2/1/0"]);

    layer.onRemove(context);
    layer.dispose();
    source.onRemove?.();
    source.dispose?.();
  });
});
