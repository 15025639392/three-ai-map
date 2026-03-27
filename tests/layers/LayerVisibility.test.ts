import { PerspectiveCamera, Scene } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { Layer } from "../../src/layers/Layer";
import { LayerManager } from "../../src/layers/LayerManager";

class VisibilityLayer extends Layer {
  updates = 0;
  sceneObjects = 0;

  onAdd(): void {
    this.sceneObjects += 1;
  }

  update(): void {
    this.updates += 1;
  }
}

describe("LayerManager visibility and ordering", () => {
  it("skips updates for hidden layers and sorts by zIndex", () => {
    const manager = new LayerManager({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1
    });
    const low = new VisibilityLayer("low");
    low.zIndex = 0;
    const high = new VisibilityLayer("high");
    high.zIndex = 10;
    high.visible = false;

    manager.add(low);
    manager.add(high);
    manager.update(16.7);

    expect(low.updates).toBe(1);
    expect(high.updates).toBe(0);
    expect(manager.getOrderedLayerIds()).toEqual(["low", "high"]);
  });
});
