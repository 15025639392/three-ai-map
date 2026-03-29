import { PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import {
  ObliquePhotogrammetryLayer,
  ObliquePhotogrammetryTileset
} from "../../src/layers/ObliquePhotogrammetryLayer";
import { LayerContext } from "../../src/layers/Layer";

function createCamera(distance: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createTilesetFixture(): ObliquePhotogrammetryTileset {
  return {
    root: {
      id: "root",
      center: {
        lng: 0,
        lat: 0,
        altitude: 0.02
      },
      geometricError: 4.8,
      halfSize: 0.09,
      color: "#5fd0ff",
      children: [
        {
          id: "child-center",
          center: {
            lng: 0,
            lat: 0,
            altitude: 0.03
          },
          geometricError: 1.6,
          halfSize: 0.055,
          color: "#6ee7b7"
        },
        {
          id: "child-east",
          center: {
            lng: 0.16,
            lat: 0,
            altitude: 0.03
          },
          geometricError: 1.6,
          halfSize: 0.05,
          color: "#f59e0b"
        },
        {
          id: "child-west",
          center: {
            lng: -0.16,
            lat: 0,
            altitude: 0.03
          },
          geometricError: 1.6,
          halfSize: 0.05,
          color: "#c084fc"
        }
      ]
    }
  };
}

function createLayerContext(
  camera: PerspectiveCamera,
  extras: Partial<Pick<LayerContext, "reportError" | "requestRender">> = {}
): LayerContext {
  return {
    scene: new Scene(),
    camera,
    globe: new GlobeMesh({ radius: 1 }),
    radius: 1,
    ...extras
  };
}

describe("ObliquePhotogrammetryLayer", () => {
  it("selects different node sets across camera altitude changes", async () => {
    const camera = createCamera(3.8);
    const context = createLayerContext(camera);
    const layer = new ObliquePhotogrammetryLayer("oblique-test", {
      tileset: createTilesetFixture(),
      maxScreenSpaceError: 1.8
    });

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);

    const farStats = layer.getDebugStats();
    expect(farStats.nodeTotalCount).toBe(4);
    expect(farStats.visibleNodeCount).toBe(1);
    expect(farStats.maxVisibleDepth).toBe(0);
    expect(layer.getSelectedNodeIds()).toEqual(["root"]);

    camera.position.set(2.6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, context);

    const nearStats = layer.getDebugStats();
    expect(nearStats.visibleNodeCount).toBeGreaterThanOrEqual(2);
    expect(nearStats.maxVisibleDepth).toBeGreaterThanOrEqual(1);
    expect(layer.getSelectedNodeIds()).toContain("child-center");
  });

  it("returns oblique photogrammetry node pick results", async () => {
    const camera = createCamera(2.6);
    const context = createLayerContext(camera);
    const layer = new ObliquePhotogrammetryLayer("oblique-test", {
      tileset: createTilesetFixture(),
      maxScreenSpaceError: 1.8
    });
    const raycaster = new Raycaster();

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);

    raycaster.set(
      new Vector3(camera.position.x, camera.position.y, camera.position.z),
      new Vector3(-camera.position.x, -camera.position.y, -camera.position.z).normalize()
    );
    const result = layer.pick(raycaster, context);

    expect(result?.type).toBe("oblique-photogrammetry-node");
    if (!result || result.type !== "oblique-photogrammetry-node") {
      throw new Error("Expected oblique-photogrammetry-node pick result");
    }
    expect(result.node.id).toBe("child-center");
    expect(result.node.depth).toBe(1);
  });

  it("reports tileset load errors through layer error channel", async () => {
    const reportError = vi.fn();
    const camera = createCamera(3.5);
    const context = createLayerContext(camera, { reportError });
    const layer = new ObliquePhotogrammetryLayer("oblique-test", {
      loadTileset: async () => {
        throw new Error("mock tileset load failure");
      }
    });

    layer.onAdd(context);
    await expect(layer.ready()).rejects.toThrow("mock tileset load failure");
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({
      source: "layer",
      layerId: "oblique-test",
      stage: "tileset-load",
      category: "data",
      severity: "error",
      recoverable: false
    });
  });
});
