import { PerspectiveCamera } from "three";
import { cartographicToCartesian } from "../../src/geo/projection";
import {
  planSurfaceTileNodes,
  shortestWrappedTileDistance,
  type SurfaceTilePlan,
  type SurfaceTilePlannerOptions,
  type TileNodePlan
} from "../../src/tiles/SurfaceTilePlanner";
import type { TileCoordinate } from "../../src/tiles/TileViewport";

function tileKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
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

function createPlannerOptions(
  interactionPhase: SurfaceTilePlannerOptions["interactionPhase"] = "idle"
): SurfaceTilePlannerOptions {
  return {
    camera: createOrbitCamera(110, 28, 0.2, 1),
    viewportWidth: 706,
    viewportHeight: 418,
    radius: 1,
    tileSize: 256,
    minZoom: 3,
    maxZoom: 8,
    interactionPhase
  };
}

function getNodeKeys(plan: SurfaceTilePlan): string[] {
  return plan.nodes.map((node) => node.key);
}

function getNodeDistance(node: TileNodePlan, centerCoordinate: TileCoordinate): number {
  const zoomDelta = node.coordinate.z - centerCoordinate.z;
  const zoomScale = zoomDelta >= 0 ? 2 ** zoomDelta : 1 / (2 ** Math.abs(zoomDelta));
  const scaledCenterX = centerCoordinate.x * zoomScale;
  const scaledCenterY = centerCoordinate.y * zoomScale;
  const dx = shortestWrappedTileDistance(node.coordinate.x, scaledCenterX, node.coordinate.z);
  const dy = Math.abs(node.coordinate.y - scaledCenterY);
  return dx * dx + dy * dy;
}

describe("SurfaceTilePlanner", () => {
  it("returns a stable node key set for the same camera view", () => {
    const options = createPlannerOptions();

    const firstPlan = planSurfaceTileNodes(options);
    const secondPlan = planSurfaceTileNodes(options);

    expect(getNodeKeys(firstPlan)).toEqual(getNodeKeys(secondPlan));
  });

  it("keeps interacting plans shallower than idle plans", () => {
    const interactingPlan = planSurfaceTileNodes(createPlannerOptions("interacting"));
    const idlePlan = planSurfaceTileNodes(createPlannerOptions("idle"));

    expect(interactingPlan.targetZoom).toBe(idlePlan.targetZoom);
    expect(interactingPlan.nodes.length).toBeLessThan(idlePlan.nodes.length);
    expect(Math.max(...interactingPlan.nodes.map((node) => node.coordinate.z)))
      .toBeLessThanOrEqual(Math.max(...idlePlan.nodes.map((node) => node.coordinate.z)));
  });

  it("sorts node priority by distance to the viewport center", () => {
    const plan = planSurfaceTileNodes(createPlannerOptions("idle"));
    const distances = plan.nodes.map((node) => getNodeDistance(node, plan.centerCoordinate));

    expect(plan.nodes.length).toBeGreaterThan(1);
    expect(distances).toEqual([...distances].sort((left, right) => left - right));
  });

  it("records parent keys for every planned node above zoom zero", () => {
    const plan = planSurfaceTileNodes(createPlannerOptions("idle"));

    expect(plan.nodes.length).toBeGreaterThan(0);

    for (const node of plan.nodes) {
      if (node.coordinate.z === 0) {
        expect(node.parentKey).toBeNull();
        continue;
      }

      const expectedParent = {
        z: node.coordinate.z - 1,
        x: Math.floor(node.coordinate.x / 2),
        y: Math.floor(node.coordinate.y / 2)
      };

      expect(node.parentKey).toBe(tileKey(expectedParent));
    }
  });
});
