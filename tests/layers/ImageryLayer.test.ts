import { PerspectiveCamera, Scene, Texture } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { ImageryLayer } from "../../src/layers/ImageryLayer";

describe("ImageryLayer", () => {
  it("sets the globe texture on add and clears it on remove", () => {
    const globe = new GlobeMesh({ radius: 1 });
    const texture = new Texture();
    const layer = new ImageryLayer("imagery", texture);

    layer.onAdd({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      globe,
      radius: 1
    });

    expect(globe.material.map).toBe(texture);

    layer.onRemove({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      globe,
      radius: 1
    });

    expect(globe.material.map).toBeNull();
  });
});
