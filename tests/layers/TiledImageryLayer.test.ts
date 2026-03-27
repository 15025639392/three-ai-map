import { Scene, PerspectiveCamera } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { TiledImageryLayer } from "../../src/layers/TiledImageryLayer";
import {
  computeTargetZoom,
  computeVisibleTileCoordinates
} from "../../src/tiles/TileViewport";

function createRendererElement(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  return element;
}

function installAnimationFrameMock() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    });
  const cancelSpy = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((frameId: number) => {
      callbacks.delete(frameId);
    });

  return {
    runFrame(time = 16.7) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    },
    restore() {
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
    }
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function getVisibleTileKeys(
  camera: PerspectiveCamera,
  rendererElement: HTMLCanvasElement,
  radius: number,
  tileSize: number,
  minZoom: number,
  maxZoom: number
): string[] {
  const zoom = computeTargetZoom({
    camera,
    viewportWidth: rendererElement.clientWidth,
    viewportHeight: rendererElement.clientHeight,
    radius,
    tileSize,
    minZoom,
    maxZoom
  });

  return computeVisibleTileCoordinates({
    camera,
    viewportWidth: rendererElement.clientWidth,
    viewportHeight: rendererElement.clientHeight,
    radius,
    zoom
  })
    .map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
    .sort();
}

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
      minZoom: 1,
      maxZoom: 1,
      tileSize: 32,
      cacheSize: 8,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.onAdd({
      scene: new Scene(),
      camera,
      globe,
      radius: 1,
      rendererElement: createRendererElement(512, 256)
    });
    await layer.ready();

    expect(globe.material.map).not.toBeNull();

    getContext.mockRestore();
  });

  it("loads only a visible subset of tiles instead of the full world", async () => {
    const requested: Array<string> = [];
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
      minZoom: 1,
      maxZoom: 4,
      tileSize: 32,
      cacheSize: 8,
      loadTile: async (coordinate) => {
        requested.push(`${coordinate.z}/${coordinate.x}/${coordinate.y}`);
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.onAdd({
      scene: new Scene(),
      camera,
      globe,
      radius: 1,
      rendererElement: createRendererElement(1280, 720)
    });
    layer.update(0, {
      scene: new Scene(),
      camera,
      globe,
      radius: 1,
      rendererElement: createRendererElement(1280, 720)
    });
    await layer.ready();

    expect(requested.length).toBeGreaterThan(0);
    expect(requested.length).toBeLessThan(16);

    getContext.mockRestore();
  });

  it("raises requested tile zoom when the camera gets closer", async () => {
    const requested: number[] = [];
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
    const rendererElement = createRendererElement(800, 600);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000);
    camera.position.set(4, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 5,
      tileSize: 32,
      cacheSize: 8,
      loadTile: async (coordinate) => {
        requested.push(coordinate.z);
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });

    layer.onAdd({
      scene,
      camera,
      globe,
      radius: 1,
      rendererElement
    });

    camera.position.set(4, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, { scene, camera, globe, radius: 1, rendererElement });
    await layer.ready();
    const farMaxZoom = Math.max(...requested);

    requested.length = 0;

    camera.position.set(1.5, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, { scene, camera, globe, radius: 1, rendererElement });
    await layer.ready();
    const nearMaxZoom = Math.max(...requested);

    expect(nearMaxZoom).toBeGreaterThan(farMaxZoom);

    getContext.mockRestore();
  });

  it("reuses cached visible tiles across small camera movements", async () => {
    const requested: Array<string> = [];
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
    const rendererElement = createRendererElement(800, 600);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 4,
      tileSize: 32,
      cacheSize: 8,
      loadTile: async (coordinate) => {
        requested.push(`${coordinate.z}/${coordinate.x}/${coordinate.y}`);
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    layer.update(0, { scene, camera, globe, radius: 1, rendererElement });
    await layer.ready();
    const initialRequestCount = requested.length;

    camera.position.set(3, 0.12, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, { scene, camera, globe, radius: 1, rendererElement });
    await layer.ready();

    expect(requested.length).toBe(initialRequestCount);

    getContext.mockRestore();
  });

  it("batches texture reprojection for multiple tile loads into a single frame", async () => {
    const animationFrame = installAnimationFrameMock();
    const outputContext = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: ""
    } as unknown as CanvasRenderingContext2D;
    const mercatorContext = {
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        return this.height < this.width ? outputContext : mercatorContext;
      });
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 1,
      tileSize: 32,
      cacheSize: 8,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    await Promise.resolve();
    await Promise.resolve();

    expect(outputContext.drawImage).toHaveBeenCalledTimes(0);

    animationFrame.runFrame();
    await layer.ready();

    expect(outputContext.drawImage).toHaveBeenCalledTimes(32);

    animationFrame.restore();
    getContext.mockRestore();
  });

  it("spreads reprojection across multiple frames when the row budget is limited", async () => {
    const animationFrame = installAnimationFrameMock();
    const outputContext = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: ""
    } as unknown as CanvasRenderingContext2D;
    const mercatorContext = {
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        return this.height < this.width ? outputContext : mercatorContext;
      });
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 5,
      tileSize: 32,
      cacheSize: 8,
      projectionRowsPerFrame: 64,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });
    let readyResolved = false;

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    const readyPromise = layer.ready().then(() => {
      readyResolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    animationFrame.runFrame();
    await Promise.resolve();

    expect(outputContext.drawImage).toHaveBeenCalledTimes(64);
    expect(readyResolved).toBe(false);

    animationFrame.runFrame();
    await Promise.resolve();

    expect(outputContext.drawImage).toHaveBeenCalledTimes(128);
    expect(readyResolved).toBe(false);

    for (let index = 0; index < 10; index += 1) {
      animationFrame.runFrame();
      await Promise.resolve();
    }
    await readyPromise;

    expect(outputContext.drawImage).toHaveBeenCalledTimes(512);

    animationFrame.restore();
    getContext.mockRestore();
  });

  it("prioritizes current-view tiles over stale queued tiles during zoom", async () => {
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
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const firstViewKeys = getVisibleTileKeys(camera, rendererElement, 1, 128, 1, 5);
    camera.position.set(1.15, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const secondViewKeys = getVisibleTileKeys(camera, rendererElement, 1, 128, 1, 5);
    const staleKeys = firstViewKeys.filter((key) => !secondViewKeys.includes(key));

    expect(staleKeys.length).toBe(firstViewKeys.length);
    expect(secondViewKeys.length).toBeGreaterThan(0);

    camera.position.set(6, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const deferredByKey = new Map<string, ReturnType<typeof createDeferred<HTMLCanvasElement>>>();
    const startedKeys: string[] = [];
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 5,
      tileSize: 128,
      cacheSize: 16,
      concurrency: 1,
      loadTile: async (coordinate) => {
        const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
        startedKeys.push(key);
        const deferred = createDeferred<HTMLCanvasElement>();
        deferredByKey.set(key, deferred);
        return deferred.promise;
      }
    });
    vi.spyOn(layer as never, "drawTileToMercator").mockImplementation(
      () => ({ top: 0, bottom: 1 }) as never
    );
    vi.spyOn(layer as never, "scheduleProjectionRange").mockImplementation(() => undefined);

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    await Promise.resolve();

    camera.position.set(1.15, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    layer.update(0, { scene, camera, globe, radius: 1, rendererElement });
    await Promise.resolve();

    deferredByKey.get(startedKeys[0])?.resolve(document.createElement("canvas"));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startedKeys[1]).toBeDefined();
    expect(secondViewKeys.includes(startedKeys[1])).toBe(true);

    getContext.mockRestore();
  });

  it("caps atlas canvas resolution by default for high maxZoom configs", async () => {
    const requestedZooms: number[] = [];
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
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(1.02, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 8,
      tileSize: 128,
      cacheSize: 8,
      loadTile: async (coordinate) => {
        requestedZooms.push(coordinate.z);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        return canvas;
      }
    });

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    await layer.ready();

    expect((layer as unknown as { mercatorCanvas: HTMLCanvasElement }).mercatorCanvas.width).toBe(4096);
    expect((layer as unknown as { mercatorCanvas: HTMLCanvasElement }).mercatorCanvas.height).toBe(4096);
    expect(Math.max(...requestedZooms)).toBeLessThanOrEqual(5);

    getContext.mockRestore();
  });

  it("reprojects only dirty rows after the initial full projection pass", async () => {
    const animationFrame = installAnimationFrameMock();
    const outputDrawImage = vi.fn();
    const outputContext = {
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      drawImage: outputDrawImage,
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: ""
    } as unknown as CanvasRenderingContext2D;
    const mercatorContext = {
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        return this.height < this.width ? outputContext : mercatorContext;
      });
    const rendererElement = createRendererElement(1280, 720);
    const scene = new Scene();
    const globe = new GlobeMesh({ radius: 1 });
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    camera.position.set(3, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new TiledImageryLayer("tiles", {
      minZoom: 1,
      maxZoom: 5,
      tileSize: 32,
      cacheSize: 8,
      projectionRowsPerFrame: 256,
      loadTile: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
      }
    });

    layer.onAdd({ scene, camera, globe, radius: 1, rendererElement });
    await Promise.resolve();
    await Promise.resolve();

    animationFrame.runFrame();
    await Promise.resolve();
    animationFrame.runFrame();
    await layer.ready();

    outputDrawImage.mockClear();

    (layer as unknown as { scheduleProjectionRange: (start: number, end: number) => void })
      .scheduleProjectionRange(120, 148);
    const flushPromise = (layer as unknown as { flushProjection: () => Promise<void> }).flushProjection();
    animationFrame.runFrame();
    await flushPromise;

    expect(outputDrawImage).toHaveBeenCalledTimes(28);

    animationFrame.restore();
    getContext.mockRestore();
  });
});
