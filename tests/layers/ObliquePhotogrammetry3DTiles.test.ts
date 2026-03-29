import { PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { LayerContext } from "../../src/layers/Layer";
import { ObliquePhotogrammetryLayer } from "../../src/layers/ObliquePhotogrammetryLayer";
import {
  convert3DTilesToObliquePhotogrammetryTileset,
  ThreeDTilesTileset
} from "../../src/layers/ObliquePhotogrammetry3DTiles";

function create3DTilesFixture(): ThreeDTilesTileset {
  const altitudeScale = 6378137;

  return {
    asset: {
      version: "1.1"
    },
    geometricError: 4.8,
    root: {
      id: "root",
      boundingVolume: {
        region: [-0.09, -0.09, 0.09, 0.09, 0.02 * altitudeScale, 0.02 * altitudeScale]
      },
      geometricError: 4.8,
      children: [
        {
          id: "child-center",
          boundingVolume: {
            region: [-0.055, -0.055, 0.055, 0.055, 0.03 * altitudeScale, 0.03 * altitudeScale]
          },
          geometricError: 1.6
        },
        {
          id: "child-east",
          boundingVolume: {
            region: [0.11, -0.05, 0.21, 0.05, 0.03 * altitudeScale, 0.03 * altitudeScale]
          },
          geometricError: 1.6
        },
        {
          id: "child-west",
          boundingVolume: {
            region: [-0.21, -0.05, -0.11, 0.05, 0.03 * altitudeScale, 0.03 * altitudeScale]
          },
          geometricError: 1.6
        }
      ]
    }
  };
}

function createCamera(distance: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(distance, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createLayerContext(camera: PerspectiveCamera): LayerContext {
  return {
    scene: new Scene(),
    camera,
    globe: new GlobeMesh({ radius: 1 }),
    radius: 1
  };
}

describe("ObliquePhotogrammetry 3D Tiles adapter", () => {
  it("converts 3D Tiles region hierarchy to oblique nodes", () => {
    const converted = convert3DTilesToObliquePhotogrammetryTileset(create3DTilesFixture(), {
      metersToAltitudeScale: 1 / 6378137
    });

    expect(converted.root.id).toBe("root");
    expect(converted.root.children?.map((child) => child.id)).toEqual([
      "child-center",
      "child-east",
      "child-west"
    ]);
    expect(converted.root.center.altitude).toBeCloseTo(0.02, 6);
    expect(converted.root.children?.[0].center.altitude).toBeCloseTo(0.03, 6);
  });

  it("throws for unsupported nodes without region or obliqueCenter extras", () => {
    const invalidTileset: ThreeDTilesTileset = {
      root: {
        id: "root",
        geometricError: 4
      }
    };

    expect(() => convert3DTilesToObliquePhotogrammetryTileset(invalidTileset)).toThrow(
      "must provide boundingVolume.region or extras.obliqueCenter"
    );
  });

  it("supports loading layer from 3D Tiles fixture directly", async () => {
    const camera = createCamera(3.8);
    const context = createLayerContext(camera);
    const layer = new ObliquePhotogrammetryLayer("oblique-3dtiles-test", {
      tileset3DTiles: create3DTilesFixture(),
      threeDTilesMetersToAltitudeScale: 1 / 6378137,
      maxScreenSpaceError: 1.8
    });

    layer.onAdd(context);
    await layer.ready();
    layer.update(0, context);
    expect(layer.getSelectedNodeIds()).toEqual(["root"]);

    camera.position.set(2.6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, context);
    expect(layer.getSelectedNodeIds()).toContain("child-center");
  });
});
