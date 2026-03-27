import { PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { MarkerLayer } from "../../src/layers/MarkerLayer";

describe("MarkerLayer", () => {
  it("returns marker metadata when a marker is picked", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const globe = new GlobeMesh({ radius: 1 });
    const layer = new MarkerLayer("markers");

    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1
    });
    layer.addMarker({
      id: "home",
      lng: 0,
      lat: 0,
      altitude: 0
    });

    const raycaster = new Raycaster(camera.position.clone(), new Vector3(-1, 0, 0));
    const result = layer.pick(raycaster);

    expect(result).not.toBeNull();

    if (!result || result.type !== "marker") {
      throw new Error("Expected a marker pick result");
    }

    expect(result.marker.id).toBe("home");
  });
});
