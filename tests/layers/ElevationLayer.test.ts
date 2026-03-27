import { Scene, PerspectiveCamera } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { ElevationLayer } from "../../src/layers/ElevationLayer";

function createRendererElement(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  return element;
}

describe("ElevationLayer", () => {
  it("loads elevation tiles and applies an elevation sampler to the globe", async () => {
    const imageData = new Uint8ClampedArray([132, 0, 0, 255]);
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: imageData }))
        } as unknown as CanvasRenderingContext2D;
      });
    const layer = new ElevationLayer("elevation", {
      zoom: 0,
      tileSize: 1,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        return canvas;
      }
    });
    const globe = new GlobeMesh({ radius: 1 });
    const setElevationSampler = vi.spyOn(globe, "setElevationSampler");
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    layer.onAdd({
      scene: new Scene(),
      camera,
      globe,
      radius: 1,
      rendererElement: createRendererElement(512, 512)
    });
    await layer.ready();

    expect(setElevationSampler).toHaveBeenCalledTimes(1);

    getContext.mockRestore();
  });
});
