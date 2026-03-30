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

describe("TerrainTileLayer shared plan interaction", () => {
  it("uses shared tile plan keys for idle and interacting phases without running an independent selector", async () => {
    const selectTiles = vi.fn(() => ({
      zoom: 0,
      coordinates: [{ z: 0, x: 0, y: 0 }]
    }));
    let currentPlan = createSurfaceTilePlan([{ z: 2, x: 1, y: 1 }], "idle");
    const context = createContext(() => currentPlan);
    const layer = new TerrainTileLayer("terrain", {
      terrain: {
        tiles: ["memory://terrain/{z}/{x}/{y}.png"],
        encode: "terrarium",
        minZoom: 0,
        maxZoom: 8
      },
      selectTiles,
      loadElevationTile: async () => createElevationTileData()
    });

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);

    expect(layer.getActiveTileKeys()).toEqual(["2/1/1"]);

    currentPlan = createSurfaceTilePlan([{ z: 1, x: 0, y: 0 }], "interacting");
    layer.update(0, context);
    await layer.ready();
    layer.update(0, context);

    expect(layer.getActiveTileKeys()).toEqual(["1/0/0"]);
    expect(selectTiles).not.toHaveBeenCalled();

    layer.onRemove(context);
    layer.dispose();
  });
});
