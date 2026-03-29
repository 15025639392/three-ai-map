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

  it("reports tile load failures through LayerContext.reportError", async () => {
    const reportError = vi.fn();
    const layer = new ElevationLayer("elevation", {
      zoom: 0,
      tileSize: 1,
      loadTile: async () => {
        throw new Error("elevation request failed");
      }
    });
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    layer.onAdd({
      scene: new Scene(),
      camera,
      globe,
      radius: 1,
      rendererElement: createRendererElement(512, 512),
      reportError
    });

    await expect(layer.ready()).rejects.toThrow("elevation request failed");
    expect(reportError).toHaveBeenCalledTimes(1);
    const payload = reportError.mock.calls[0][0] as {
      source: string;
      layerId: string;
      stage: string;
      category: string;
      severity: string;
      tileKey?: string;
      metadata?: {
        tileKey?: string;
        coordinate?: { z: number; x: number; y: number };
      };
      recoverable: boolean;
      error: Error;
    };

    expect(payload.source).toBe("layer");
    expect(payload.layerId).toBe("elevation");
    expect(payload.recoverable).toBe(true);
    expect(payload.stage).toBe("tile-load");
    expect(payload.category).toBe("network");
    expect(payload.severity).toBe("warn");
    expect(payload.tileKey ?? payload.metadata?.tileKey).toBe("0/0/0");
    expect(payload.metadata?.coordinate).toEqual({ z: 0, x: 0, y: 0 });
    expect(payload.error.message).toBe("elevation request failed");
  });

  it("applies recovery overrides for tile-load retries through layer context", async () => {
    const imageData = new Uint8ClampedArray([132, 0, 0, 255]);
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: imageData }))
        } as unknown as CanvasRenderingContext2D;
      });
    const reportError = vi.fn();
    const resolveRecovery = vi.fn(() => ({
      elevationRetryAttempts: 2,
      elevationRetryDelayMs: 0
    }));
    let attempt = 0;
    const layer = new ElevationLayer("elevation-retry", {
      zoom: 0,
      tileSize: 1,
      loadTile: async () => {
        attempt += 1;

        if (attempt < 3) {
          throw new Error(`elevation transient ${attempt}`);
        }

        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        return canvas;
      }
    });
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    try {
      layer.onAdd({
        scene: new Scene(),
        camera,
        globe,
        radius: 1,
        rendererElement: createRendererElement(512, 512),
        reportError,
        resolveRecovery
      });
      await layer.ready();

      expect(attempt).toBe(3);
      expect(reportError).not.toHaveBeenCalled();
      expect(resolveRecovery).toHaveBeenCalledWith(expect.objectContaining({
        layerId: "elevation-retry",
        stage: "tile-load",
        category: "network",
        severity: "warn"
      }));
    } finally {
      getContext.mockRestore();
    }
  });
});
