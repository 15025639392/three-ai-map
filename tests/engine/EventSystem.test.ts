import { GlobeEngine } from "../../src/engine/GlobeEngine";
import { Layer } from "../../src/layers/Layer";
import { RasterLayer } from "../../src/layers/RasterLayer";
import { TerrainTileLayer } from "../../src/layers/TerrainTileLayer";
import { VectorTileLayer } from "../../src/layers/VectorTileLayer";
import { RasterTileSource } from "../../src/sources/RasterTileSource";

class FakeRendererSystem {
  readonly renderer = { domElement: document.createElement("canvas") };
  readonly render = vi.fn();
  readonly setSize = vi.fn();
  readonly dispose = vi.fn();

  constructor(container: HTMLElement) {
    Object.defineProperty(this.renderer.domElement, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100
      })
    });
    container.appendChild(this.renderer.domElement);
  }
}

function createImageryCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  return canvas;
}

function createElevationTileData(): { width: number; height: number; data: Float32Array } {
  return {
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 0, 0])
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = performance.now();

  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error("waitUntil timed out");
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 10);
    });
  }
}

describe("GlobeEngine event system", () => {
  it("emits click events with pick results", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const handler = vi.fn();

    engine.addMarker({
      id: "capital",
      lng: 0,
      lat: 0,
      altitude: 0
    });
    engine.setView({ lng: 0, lat: 0, altitude: 2 });
    engine.render();
    engine.on("click", handler);

    container.querySelector("canvas")?.dispatchEvent(
      new MouseEvent("click", { clientX: 50, clientY: 50 })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].pickResult?.type).toBe("marker");

    engine.destroy();
  });

  it("emits error events reported by layers", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const handler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on: (eventName: "error", handler: (payload: unknown) => void) => () => void;
    };
    typedEngine.on("error", handler);
    const terrain = new TerrainTileLayer("terrain", {
      terrain: {
        tiles: ["dem://{z}/{x}/{y}"],
        encode: "terrarium",
        minZoom: 0,
        maxZoom: 0,
        tileSize: 1
      },
      meshSegments: 1,
      selectTiles: () => ({
        zoom: 0,
        coordinates: [{ z: 0, x: 0, y: 0 }]
      }),
      loadElevationTile: async () => createElevationTileData()
    });
    engine.addLayer(terrain);
    await terrain.ready();

    const source = new RasterTileSource("raster", {
      tiles: ["raster://{z}/{x}/{y}"],
      maxZoom: 0,
      loadTile: async () => {
        throw new Error("imagery failed");
      }
    });
    engine.addSource("raster", source);
    engine.addLayer(new RasterLayer({ id: "raster", source: "raster" }));
    await waitUntil(() => handler.mock.calls.length > 0);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0] as {
      source: string;
      layerId: string;
      stage: string;
      category: string;
      severity: string;
      tileKey?: string;
      metadata?: { tileKey?: string; coordinate?: { z: number; x: number; y: number } };
      recoverable: boolean;
      error: Error;
    };

    expect(payload.source).toBe("layer");
    expect(payload.layerId).toBe("raster");
    expect(payload.recoverable).toBe(true);
    expect(payload.stage).toBe("imagery");
    expect(payload.category).toBe("network");
    expect(payload.severity).toBe("warn");
    expect(payload.tileKey ?? payload.metadata?.tileKey).toBe("0/0/0");
    expect(payload.metadata?.coordinate).toEqual({ z: 0, x: 0, y: 0 });
    expect(payload.error).toBeInstanceOf(Error);
    expect(payload.error.message).toBe("imagery failed");

    engine.destroy();
  });

  it("emits layer error events reported through the layer context", () => {
    class BrokenLayer extends Layer {
      override onAdd(context: Parameters<Layer["onAdd"]>[0]): void {
        context.reportError?.({
          source: "layer",
          layerId: this.id,
          stage: "onAdd",
          category: "unknown",
          severity: "error",
          error: new Error("broken layer"),
          recoverable: true
        });
      }
    }

    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const handler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on(
        eventName: "error",
        errorHandler: (payload: {
          source: "layer";
          layerId: string;
          stage: string;
          category: string;
          severity: string;
          error: unknown;
          recoverable: boolean;
        }) => void
      ): () => void;
    };

    typedEngine.on("error", handler);
    engine.addLayer(new BrokenLayer("broken"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      source: "layer",
      layerId: "broken",
      stage: "onAdd",
      category: "unknown",
      severity: "error",
      recoverable: true
    }));
    expect(handler.mock.calls[0][0].error).toBeInstanceOf(Error);

    engine.destroy();
  });

  it("applies engine recovery policy to imagery retries", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host),
      recoveryPolicy: {
        rules: [
          {
            category: "network",
            severity: "warn",
            stage: "imagery",
            overrides: {
              imageryRetryAttempts: 2,
              imageryRetryDelayMs: 0
            }
          }
        ]
      }
    });
    const errorHandler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on: (eventName: "error", handler: (payload: unknown) => void) => () => void;
    };
    let attempt = 0;
    typedEngine.on("error", errorHandler);
    const terrain = new TerrainTileLayer("terrain", {
      terrain: {
        tiles: ["dem://{z}/{x}/{y}"],
        encode: "terrarium",
        minZoom: 0,
        maxZoom: 0,
        tileSize: 1
      },
      meshSegments: 1,
      selectTiles: () => ({
        zoom: 0,
        coordinates: [{ z: 0, x: 0, y: 0 }]
      }),
      loadElevationTile: async () => createElevationTileData()
    });
    engine.addLayer(terrain);
    await terrain.ready();

    const source = new RasterTileSource("raster", {
      tiles: ["raster://{z}/{x}/{y}"],
      maxZoom: 0,
      loadTile: async () => {
        attempt += 1;

        if (attempt < 3) {
          throw new Error(`transient imagery failure ${attempt}`);
        }

        return createImageryCanvas();
      }
    });
    engine.addSource("raster", source);
    engine.addLayer(new RasterLayer({ id: "raster", source: "raster" }));
    await waitUntil(() => attempt >= 3);

    expect(attempt).toBe(3);
    expect(errorHandler).not.toHaveBeenCalled();
    expect(engine.getPerformanceReport().metrics.get("recoveryPolicyQueryCount:imagery")?.value)
      .toBeGreaterThan(0);
    expect(engine.getPerformanceReport().metrics.get("recoveryPolicyHitCount:imagery")?.value)
      .toBeGreaterThan(0);
    expect(engine.getPerformanceReport().metrics.get("recoveryPolicyRuleHitCount:imagery")?.value)
      .toBeGreaterThan(0);

    engine.destroy();
  });

  it("routes recovery policy by stage/category/severity and supports fallback", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        return {
          fillStyle: "",
          fillRect: vi.fn()
        } as unknown as CanvasRenderingContext2D;
      });
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host),
      recoveryPolicy: {
        rules: [
          {
            stage: "imagery",
            category: "network",
            severity: "error",
            overrides: {
              imageryRetryAttempts: 6
            }
          },
          {
            stage: "imagery",
            category: "network",
            severity: "warn",
            overrides: {
              imageryRetryAttempts: 1,
              imageryRetryDelayMs: 0,
              imageryFallbackColor: "#223344"
            }
          },
          {
            stage: "elevation",
            category: "network",
            severity: "warn",
            overrides: {
              imageryRetryAttempts: 6
            }
          }
        ]
      }
    });
    const errorHandler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on: (eventName: "error", handler: (payload: unknown) => void) => () => void;
    };
    let attempt = 0;
    typedEngine.on("error", errorHandler);
    try {
      const terrain = new TerrainTileLayer("terrain", {
        terrain: {
          tiles: ["dem://{z}/{x}/{y}"],
          encode: "terrarium",
          minZoom: 0,
          maxZoom: 0,
          tileSize: 1
        },
        meshSegments: 1,
        selectTiles: () => ({
          zoom: 0,
          coordinates: [{ z: 0, x: 0, y: 0 }]
        }),
        loadElevationTile: async () => createElevationTileData()
      });
      engine.addLayer(terrain);
      await terrain.ready();

      const source = new RasterTileSource("raster", {
        tiles: ["raster://{z}/{x}/{y}"],
        maxZoom: 0,
        loadTile: async () => {
          attempt += 1;
          throw new Error(`persistent imagery failure ${attempt}`);
        }
      });
      engine.addSource("raster", source);
      engine.addLayer(new RasterLayer({ id: "raster", source: "raster" }));
      await waitUntil(() => errorHandler.mock.calls.length > 0);

      expect(attempt).toBe(2);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        source: "layer",
        layerId: "raster",
        stage: "imagery",
        category: "network",
        severity: "warn",
        recoverable: true,
        tileKey: "0/0/0",
        metadata: expect.objectContaining({
          attempts: 2,
          fallbackUsed: true
        })
      }));
    } finally {
      getContext.mockRestore();
      engine.destroy();
    }
  });

  it("applies engine recovery policy to elevation retries and tracks policy metrics", async () => {
    const imageData = new Uint8ClampedArray([132, 0, 0, 255]);
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: imageData })),
          fillStyle: "",
          fillRect: vi.fn()
        } as unknown as CanvasRenderingContext2D;
      });
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host),
      recoveryPolicy: {
        rules: [
          {
            stage: "tile-load",
            category: "network",
            severity: "warn",
            overrides: {
              elevationRetryAttempts: 2,
              elevationRetryDelayMs: 0
            }
          }
        ]
      }
    });
    const errorHandler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on: (eventName: "error", handler: (payload: unknown) => void) => () => void;
    };
    let attempt = 0;
    typedEngine.on("error", errorHandler);
    try {
      const terrain = new TerrainTileLayer("terrain", {
        terrain: {
          tiles: ["dem://{z}/{x}/{y}"],
          encode: "terrarium",
          minZoom: 0,
          maxZoom: 0,
          tileSize: 1
        },
        meshSegments: 1,
        selectTiles: () => ({
          zoom: 0,
          coordinates: [{ z: 0, x: 0, y: 0 }]
        }),
        loadElevationTile: async () => {
          attempt += 1;

          if (attempt < 3) {
            throw new Error(`elevation transient ${attempt}`);
          }

          return createElevationTileData();
        }
      });

      engine.addLayer(terrain);
      await terrain.ready();

      expect(attempt).toBe(3);
      expect(errorHandler).not.toHaveBeenCalled();
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyQueryCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyHitCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyRuleHitCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyQueryCount:tile-load")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyHitCount:tile-load")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyRuleHitCount:tile-load")?.value)
        .toBeGreaterThan(0);
    } finally {
      getContext.mockRestore();
      engine.destroy();
    }
  });

  it("routes vector tile parse recovery policy by stage/category/severity", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host),
      recoveryPolicy: {
        rules: [
          {
            stage: "tile-parse",
            category: "data",
            severity: "warn",
            overrides: {
              vectorParseRetryAttempts: 1,
              vectorParseRetryDelayMs: 0,
              vectorParseFallbackToEmpty: true
            }
          }
        ]
      }
    });
    const errorHandler = vi.fn();
    const typedEngine = engine as GlobeEngine & {
      on: (eventName: "error", handler: (payload: unknown) => void) => () => void;
    };
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf"
    });
    const parseTile = vi
      .spyOn(layer, "parseTile")
      .mockRejectedValueOnce(new Error("vector parse failure 1"))
      .mockRejectedValueOnce(new Error("vector parse failure 2"));

    typedEngine.on("error", errorHandler);
    try {
      engine.addLayer(layer);
      const features = await layer.setTileData(new Uint8Array([1, 2, 3]), 0, 0, 0);

      expect(features).toEqual([]);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        source: "layer",
        layerId: layer.id,
        stage: "tile-parse",
        category: "data",
        severity: "warn",
        recoverable: true,
        tileKey: "0/0/0",
        metadata: expect.objectContaining({
          attempts: 2,
          fallbackUsed: true
        })
      }));
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyQueryCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyHitCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyRuleHitCount")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyQueryCount:tile-parse")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyHitCount:tile-parse")?.value)
        .toBeGreaterThan(0);
      expect(engine.getPerformanceReport().metrics.get("recoveryPolicyRuleHitCount:tile-parse")?.value)
        .toBeGreaterThan(0);
    } finally {
      parseTile.mockRestore();
      engine.destroy();
    }
  });
});
