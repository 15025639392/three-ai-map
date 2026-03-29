import Pbf from "pbf";
import { Object3D, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { cartographicToCartesian } from "../../src/geo/projection";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { LayerContext, LayerErrorPayload, LayerRecoveryOverrides, LayerRecoveryQuery } from "../../src/layers/Layer";
import { VectorTileLayer } from "../../src/layers/VectorTileLayer";

interface FixtureFeature {
  id: number;
  type: number;
  tags?: number[];
  geometry: number[];
}

interface FixtureLayer {
  name: string;
  keys?: string[];
  values?: string[];
  features: FixtureFeature[];
  extent?: number;
}

function moveTo(points: Array<[number, number]>): number[] {
  const geometry = [(points.length << 3) | 1];
  let previousX = 0;
  let previousY = 0;

  for (const [x, y] of points) {
    geometry.push(encodeSigned(x - previousX), encodeSigned(y - previousY));
    previousX = x;
    previousY = y;
  }

  return geometry;
}

function lineTo(points: Array<[number, number]>, start: [number, number]): number[] {
  const geometry = [(points.length << 3) | 2];
  let [previousX, previousY] = start;

  for (const [x, y] of points) {
    geometry.push(encodeSigned(x - previousX), encodeSigned(y - previousY));
    previousX = x;
    previousY = y;
  }

  return geometry;
}

function createVectorTileFixture(): Uint8Array {
  const layers: FixtureLayer[] = [
    {
      name: "places",
      keys: ["kind"],
      values: ["capital"],
      features: [
        {
          id: 1,
          type: 1,
          tags: [0, 0],
          geometry: moveTo([[2048, 2048]])
        }
      ]
    },
    {
      name: "roads",
      keys: ["kind"],
      values: ["arterial"],
      features: [
        {
          id: 2,
          type: 2,
          tags: [0, 0],
          geometry: [
            ...moveTo([[0, 0]]),
            ...lineTo([[4096, 4096]], [0, 0])
          ]
        }
      ]
    },
    {
      name: "landuse",
      keys: ["kind"],
      values: ["park"],
      features: [
        {
          id: 3,
          type: 3,
          tags: [0, 0],
          geometry: [
            ...moveTo([[0, 0]]),
            ...lineTo([[4096, 0], [4096, 4096], [0, 4096]], [0, 0]),
            15
          ]
        }
      ]
    }
  ];
  const pbf = new Pbf();

  for (const layer of layers) {
    pbf.writeMessage(3, writeLayer, layer);
  }

  return pbf.finish();
}

function encodeSigned(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}

function writeValue(value: string, pbf: Pbf): void {
  pbf.writeStringField(1, value);
}

function writeFeature(feature: FixtureFeature, pbf: Pbf): void {
  pbf.writeVarintField(1, feature.id);

  if (feature.tags && feature.tags.length > 0) {
    pbf.writePackedVarint(2, feature.tags);
  }

  pbf.writeVarintField(3, feature.type);
  pbf.writePackedVarint(4, feature.geometry);
}

function writeLayer(layer: FixtureLayer, pbf: Pbf): void {
  pbf.writeStringField(1, layer.name);

  for (const feature of layer.features) {
    pbf.writeMessage(2, writeFeature, feature);
  }

  for (const key of layer.keys ?? []) {
    pbf.writeStringField(3, key);
  }

  for (const value of layer.values ?? []) {
    pbf.writeMessage(4, writeValue, value);
  }

  pbf.writeVarintField(5, layer.extent ?? 4096);
  pbf.writeVarintField(15, 2);
}

function createLayerContext(
  scene = new Scene(),
  extras: Partial<Pick<LayerContext, "reportError" | "resolveRecovery">> = {}
): LayerContext {
  return {
    scene,
    camera: new PerspectiveCamera(),
    globe: new GlobeMesh({ radius: 1 }),
    radius: 1,
    ...extras
  };
}

describe("VectorTileLayer", () => {
  it("creates a vector tile layer", () => {
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf"
    });

    expect(layer).toBeDefined();
    expect(layer.id).toBeDefined();
  });

  it("parses point line and polygon features from a real vector tile payload", async () => {
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf"
    });

    const features = await layer.parseTile(createVectorTileFixture(), 0, 0, 0);

    expect(features.map((feature) => `${feature.layer}:${feature.type}`).sort()).toEqual([
      "landuse:polygon",
      "places:point",
      "roads:line"
    ]);

    const point = features.find((feature) => feature.type === "point");
    const line = features.find((feature) => feature.type === "line");
    const polygon = features.find((feature) => feature.type === "polygon");

    expect(point?.geometry[0][0][0]).toBeCloseTo(0, 5);
    expect(point?.geometry[0][0][1]).toBeCloseTo(0, 5);
    expect(line?.geometry[0]).toHaveLength(2);
    expect(polygon?.geometry[0].length).toBeGreaterThanOrEqual(4);
    expect(point?.properties).toMatchObject({ kind: "capital" });
    expect(line?.properties).toMatchObject({ kind: "arterial" });
    expect(polygon?.properties).toMatchObject({ kind: "park" });
  });

  it("filters parsed features by layer name", async () => {
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf",
      layerFilter: ["roads"]
    });

    const features = await layer.parseTile(createVectorTileFixture(), 0, 0, 0);

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      layer: "roads",
      type: "line"
    });
  });

  it("renders point line and polygon features into the scene", async () => {
    const scene = new Scene();
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf",
      style: {
        places: { pointColor: "#ffcc66", pointSize: 0.03 },
        roads: { strokeColor: "#ffffff" },
        landuse: { fillColor: "#44ff88", opacity: 0.6 }
      }
    });
    const typedLayer = layer as VectorTileLayer & {
      setTileData: (tileData: Uint8Array, x: number, y: number, z: number) => Promise<void>;
    };

    await typedLayer.setTileData(createVectorTileFixture(), 0, 0, 0);
    layer.onAdd(createLayerContext(scene));

    const group = scene.getObjectByName(layer.id);
    expect(group).toBeDefined();
    expect(group?.children).toHaveLength(3);
    expect(group?.children.some((child) => child.userData.vectorFeature?.type === "point")).toBe(true);
    expect(group?.children.some((child) => child.userData.vectorFeature?.type === "line")).toBe(true);
    expect(group?.children.some((child) => child.userData.vectorFeature?.type === "polygon")).toBe(true);
  });

  it("renders only filtered layers into the scene", async () => {
    const scene = new Scene();
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf",
      layerFilter: ["roads"]
    });
    const typedLayer = layer as VectorTileLayer & {
      setTileData: (tileData: Uint8Array, x: number, y: number, z: number) => Promise<void>;
    };

    await typedLayer.setTileData(createVectorTileFixture(), 0, 0, 0);
    layer.onAdd(createLayerContext(scene));

    const group = scene.getObjectByName(layer.id);
    expect(group?.children).toHaveLength(1);
    expect(group?.children[0].userData.vectorFeature?.layer).toBe("roads");
  });

  it("picks vector features through raycaster intersections", () => {
    const scene = new Scene();
    const context = createLayerContext(scene);
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf"
    });
    layer.setFeatures([
      {
        type: "point",
        layer: "places",
        geometry: [[[0, 0]]],
        properties: {
          kind: "capital"
        }
      }
    ]);
    layer.onAdd(context);

    const expectedPoint = cartographicToCartesian(
      {
        lng: 0,
        lat: 0,
        height: context.radius * 0.01
      },
      context.radius
    );
    context.camera.position.set(expectedPoint.x * 3, expectedPoint.y * 3, expectedPoint.z * 3);
    context.camera.lookAt(0, 0, 0);
    context.camera.updateMatrixWorld(true);
    context.camera.updateProjectionMatrix();

    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), context.camera);
    const result = layer.pick(raycaster);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("vector-feature");
    if (!result || result.type !== "vector-feature") {
      throw new Error("Expected vector-feature pick result");
    }
    expect(result.feature.type).toBe("point");
    expect(result.feature.layer).toBe("places");
    expect(result.feature.properties).toMatchObject({ kind: "capital" });

    raycaster.setFromCamera(new Vector2(-0.95, -0.95), context.camera);
    expect(layer.pick(raycaster)).toBeNull();

    layer.onRemove(context);
  });

  it("prefers higher zIndex features when overlapping at the same coordinate", () => {
    const scene = new Scene();
    const context = createLayerContext(scene);
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf",
      style: {
        "places-low": {
          pointSize: 0.05,
          zIndex: 1
        },
        "places-high": {
          pointSize: 0.05,
          zIndex: 10
        }
      }
    });
    layer.setFeatures([
      {
        type: "point",
        layer: "places-low",
        geometry: [[[0, 0]]],
        properties: {
          kind: "low-zindex-target"
        }
      },
      {
        type: "point",
        layer: "places-high",
        geometry: [[[0, 0]]],
        properties: {
          kind: "high-zindex-target"
        }
      }
    ]);
    layer.onAdd(context);

    const expectedPoint = cartographicToCartesian(
      {
        lng: 0,
        lat: 0,
        height: context.radius * 0.01
      },
      context.radius
    );
    context.camera.position.set(expectedPoint.x * 3, expectedPoint.y * 3, expectedPoint.z * 3);
    context.camera.lookAt(0, 0, 0);
    context.camera.updateMatrixWorld(true);
    context.camera.updateProjectionMatrix();

    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), context.camera);
    const result = layer.pick(raycaster);

    expect(result?.type).toBe("vector-feature");
    if (!result || result.type !== "vector-feature") {
      throw new Error("Expected vector-feature pick result");
    }
    expect(result.feature.layer).toBe("places-high");
    expect(result.feature.properties).toMatchObject({ kind: "high-zindex-target" });

    layer.onRemove(context);
  });

  it("prefers nearer intersections when zIndex is the same", () => {
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf",
      style: {
        places: {
          pointSize: 0.05,
          zIndex: 5
        }
      }
    });
    const farFeature = layer.applyStyle({
      type: "point",
      layer: "places",
      geometry: [[[0, 0]]],
      properties: {
        kind: "far-depth-target"
      }
    });
    const nearFeature = layer.applyStyle({
      type: "point",
      layer: "places",
      geometry: [[[0, 0]]],
      properties: {
        kind: "near-depth-target"
      }
    });
    const farObject = new Object3D();
    const nearObject = new Object3D();
    farObject.userData.vectorFeature = farFeature;
    nearObject.userData.vectorFeature = nearFeature;
    const pickBestIntersection = (layer as unknown as {
      pickBestIntersection: (
        intersections: Array<{ object: Object3D; point: Vector3; distance: number }>
      ) => { feature: { properties?: Record<string, unknown> } } | null;
    }).pickBestIntersection.bind(layer);

    const result = pickBestIntersection([
      { object: farObject, point: new Vector3(0, 0, 0), distance: 2.4 },
      { object: nearObject, point: new Vector3(0, 0, 0), distance: 1.8 }
    ]);

    expect(result?.feature.properties).toMatchObject({ kind: "near-depth-target" });
  });

  it("removes rendered objects from the scene on remove", async () => {
    const scene = new Scene();
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf"
    });
    const typedLayer = layer as VectorTileLayer & {
      setTileData: (tileData: Uint8Array, x: number, y: number, z: number) => Promise<void>;
    };
    const context = createLayerContext(scene);

    await typedLayer.setTileData(createVectorTileFixture(), 0, 0, 0);
    layer.onAdd(context);

    expect(scene.getObjectByName(layer.id)).toBeDefined();

    layer.onRemove(context);

    expect(scene.getObjectByName(layer.id)).toBeUndefined();
  });

  it("applies layer style onto parsed feature properties", () => {
    const layer = new VectorTileLayer({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf",
      style: {
        roads: {
          strokeColor: 0xff0000,
          strokeWidth: 2
        }
      }
    });

    const styledFeature = layer.applyStyle({
      type: "line",
      layer: "roads",
      geometry: [[[0, 0], [1, 1]]],
      properties: {
        kind: "arterial"
      }
    });

    expect(styledFeature.properties).toMatchObject({
      kind: "arterial",
      style: {
        strokeColor: 0xff0000,
        strokeWidth: 2
      }
    });
  });

  it("formats tile urls and respects zoom visibility bounds", () => {
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf",
      minZoom: 3,
      maxZoom: 8
    });

    expect(layer.getTileUrl(1, 2, 3)).toBe("https://tiles.example.com/3/1/2.pbf");
    expect(layer.shouldRender(2)).toBe(false);
    expect(layer.shouldRender(3)).toBe(true);
    expect(layer.shouldRender(8)).toBe(true);
    expect(layer.shouldRender(9)).toBe(false);
  });

  it("applies recovery overrides when tile parsing fails transiently", async () => {
    const reportError = vi.fn<(payload: LayerErrorPayload) => void>();
    const resolveRecovery = vi.fn<(query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined>(
      () => ({
        vectorParseRetryAttempts: 1,
        vectorParseRetryDelayMs: 0
      })
    );
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf"
    });
    const parseTile = vi
      .spyOn(layer, "parseTile")
      .mockRejectedValueOnce(new Error("vector transient parse failure"))
      .mockResolvedValueOnce([
        {
          type: "point",
          layer: "places",
          geometry: [[[0, 0]]],
          properties: { kind: "capital" }
        }
      ]);

    layer.onAdd(createLayerContext(new Scene(), { reportError, resolveRecovery }));
    const features = await layer.setTileData(new Uint8Array([1, 2, 3]), 0, 0, 0);

    expect(parseTile).toHaveBeenCalledTimes(2);
    expect(features).toHaveLength(1);
    expect(reportError).not.toHaveBeenCalled();
    expect(resolveRecovery).toHaveBeenCalledWith(expect.objectContaining({
      stage: "tile-parse",
      category: "data",
      severity: "warn"
    }));

    parseTile.mockRestore();
  });

  it("falls back to empty tile when parse retries are exhausted", async () => {
    const reportError = vi.fn<(payload: LayerErrorPayload) => void>();
    const resolveRecovery = vi.fn<(query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined>(
      () => ({
        vectorParseRetryAttempts: 1,
        vectorParseRetryDelayMs: 0,
        vectorParseFallbackToEmpty: true
      })
    );
    const layer = new VectorTileLayer({
      url: "https://tiles.example.com/{z}/{x}/{y}.pbf"
    });
    const parseTile = vi
      .spyOn(layer, "parseTile")
      .mockRejectedValueOnce(new Error("vector parse failure 1"))
      .mockRejectedValueOnce(new Error("vector parse failure 2"));

    layer.onAdd(createLayerContext(new Scene(), { reportError, resolveRecovery }));
    const features = await layer.setTileData(new Uint8Array([1, 2, 3]), 0, 0, 0);

    expect(parseTile).toHaveBeenCalledTimes(2);
    expect(features).toEqual([]);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({
      source: "layer",
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

    parseTile.mockRestore();
  });
});
