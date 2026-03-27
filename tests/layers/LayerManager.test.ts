import { PerspectiveCamera, Scene } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { Layer } from "../../src/layers/Layer";
import { LayerManager } from "../../src/layers/LayerManager";

class TestLayer extends Layer {
  added = 0;
  removed = 0;
  updated = 0;

  onAdd(): void {
    this.added += 1;
  }

  onRemove(): void {
    this.removed += 1;
  }

  update(): void {
    this.updated += 1;
  }
}

describe("LayerManager", () => {
  it("runs layer lifecycle hooks in order", () => {
    const manager = new LayerManager({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1
    });
    const layer = new TestLayer("test");

    manager.add(layer);
    manager.update(16.7);
    manager.remove("test");

    expect(layer.added).toBe(1);
    expect(layer.updated).toBe(1);
    expect(layer.removed).toBe(1);
  });
});
