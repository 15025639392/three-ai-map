import { Scene, PerspectiveCamera } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { TiledImageryLayer } from "../../src/layers/TiledImageryLayer";

describe("TiledImageryLayer", () => {
  it("creates a canvas texture and applies it to the globe", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        const gradient = {
          addColorStop: vi.fn()
        };

        return {
          createLinearGradient: vi.fn(() => gradient),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          fillStyle: ""
        } as unknown as CanvasRenderingContext2D;
      });
    const layer = new TiledImageryLayer("tiles", {
      tileSize: 32,
      zoom: 1,
      cacheSize: 8,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });
    const globe = new GlobeMesh({ radius: 1 });

    layer.onAdd({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      globe,
      radius: 1
    });
    await layer.ready();

    expect(globe.material.map).not.toBeNull();

    getContext.mockRestore();
  });
});
