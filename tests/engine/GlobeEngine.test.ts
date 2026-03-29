import { GlobeEngine } from "../../src/engine/GlobeEngine";
import { VectorTileLayer } from "../../src/layers/VectorTileLayer";

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

describe("GlobeEngine", () => {
  it("creates and destroys the engine cleanly", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    expect(container.querySelector("canvas")).not.toBeNull();

    engine.destroy();

    expect(container.querySelector("canvas")).toBeNull();
  });

  it("updates the camera view via setView", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    engine.setView({ lng: 10, lat: 20, altitude: 3 });

    expect(engine.getView().lng).toBeCloseTo(10);
    expect(engine.getView().lat).toBeCloseTo(20);
    expect(engine.getView().altitude).toBeCloseTo(3);

    engine.destroy();
  });

  it("mirrors the display canvas by default", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    const canvas = container.querySelector("canvas");
    expect(canvas?.style.transform).toBe("scaleX(-1)");
    expect(canvas?.style.transformOrigin).toBe("50% 50%");

    engine.destroy();
  });

  it("can disable display mirroring", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      mirrorDisplayX: false,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    const canvas = container.querySelector("canvas");
    expect(canvas?.style.transform).toBe("");
    expect(canvas?.style.transformOrigin).toBe("");

    engine.destroy();
  });

  it("maps globe picks to mirrored visual coords by default", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const unmirroredContainer = document.createElement("div");
    Object.defineProperty(unmirroredContainer, "clientWidth", { value: 800 });
    Object.defineProperty(unmirroredContainer, "clientHeight", { value: 600 });

    const mirroredEngine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const engine = new GlobeEngine({
      container: unmirroredContainer,
      mirrorDisplayX: false,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    mirroredEngine.setView({ lng: 0, lat: 0, altitude: 2 });
    engine.setView({ lng: 0, lat: 0, altitude: 2 });
    mirroredEngine.render();
    engine.render();

    const normalRightPick = engine.pick(75, 50);
    const mirroredLeftPick = mirroredEngine.pick(25, 50);

    if (!normalRightPick || normalRightPick.type !== "globe") {
      throw new Error("Expected a normal globe pick");
    }

    if (!mirroredLeftPick || mirroredLeftPick.type !== "globe") {
      throw new Error("Expected a mirrored globe pick");
    }

    expect(mirroredLeftPick.cartographic.lng).toBeCloseTo(normalRightPick.cartographic.lng, 6);
    expect(mirroredLeftPick.cartographic.lat).toBeCloseTo(normalRightPick.cartographic.lat, 6);

    mirroredEngine.destroy();
    engine.destroy();
  });

  it("prefers marker hits when picking through the screen center", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    engine.setView({ lng: 0, lat: 0, altitude: 2 });
    engine.addMarker({
      id: "capital",
      lng: 0,
      lat: 0,
      altitude: 0
    });
    engine.render();

    const result = engine.pick(50, 50);

    if (!result || result.type !== "marker") {
      throw new Error("Expected a marker pick result");
    }

    expect(result.marker.id).toBe("capital");

    engine.destroy();
  });

  it("returns vector-feature hits before globe hits", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const vectorLayer = new VectorTileLayer({
      url: "memory://{z}/{x}/{y}.pbf",
      style: {
        places: {
          pointSize: 0.05
        }
      }
    });
    vectorLayer.setFeatures([
      {
        type: "point",
        layer: "places",
        geometry: [[[0, 0]]],
        properties: {
          kind: "center-point"
        }
      }
    ]);

    engine.addLayer(vectorLayer);
    engine.setView({ lng: 0, lat: 0, altitude: 2 });
    engine.render();

    const result = engine.pick(50, 50);

    if (!result || result.type !== "vector-feature") {
      throw new Error("Expected a vector-feature pick result");
    }

    expect(result.feature.layer).toBe("places");
    expect(result.feature.type).toBe("point");
    expect(result.feature.properties).toMatchObject({ kind: "center-point" });

    engine.destroy();
  });

  it("prefers higher zIndex vector layer and falls back when hidden", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const lowLayer = new VectorTileLayer({
      url: "memory://{z}/{x}/{y}.pbf",
      style: {
        "places-low": {
          pointSize: 0.05
        }
      }
    });
    const highLayer = new VectorTileLayer({
      url: "memory://{z}/{x}/{y}.pbf",
      style: {
        "places-high": {
          pointSize: 0.05
        }
      }
    });
    lowLayer.zIndex = 2;
    highLayer.zIndex = 12;
    lowLayer.setFeatures([
      {
        type: "point",
        layer: "places-low",
        geometry: [[[0, 0]]],
        properties: {
          kind: "low-layer-target"
        }
      }
    ]);
    highLayer.setFeatures([
      {
        type: "point",
        layer: "places-high",
        geometry: [[[0, 0]]],
        properties: {
          kind: "high-layer-target"
        }
      }
    ]);

    engine.addLayer(lowLayer);
    engine.addLayer(highLayer);
    engine.setView({ lng: 0, lat: 0, altitude: 2 });
    engine.render();

    const topResult = engine.pick(50, 50);
    expect(topResult?.type).toBe("vector-feature");
    if (!topResult || topResult.type !== "vector-feature") {
      throw new Error("Expected a vector-feature pick result");
    }
    expect(topResult.feature.layer).toBe("places-high");
    expect(topResult.feature.properties).toMatchObject({ kind: "high-layer-target" });

    highLayer.visible = false;
    engine.render();

    const fallbackResult = engine.pick(50, 50);
    expect(fallbackResult?.type).toBe("vector-feature");
    if (!fallbackResult || fallbackResult.type !== "vector-feature") {
      throw new Error("Expected a vector-feature fallback pick result");
    }
    expect(fallbackResult.feature.layer).toBe("places-low");
    expect(fallbackResult.feature.properties).toMatchObject({ kind: "low-layer-target" });

    engine.destroy();
  });

  it("exposes engine-level performance metrics after rendering", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });

    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const typedEngine = engine as GlobeEngine & {
      getPerformanceReport: () => {
        fps: number;
        frameTime: number;
        metrics: Map<string, { value: number }>;
      };
    };

    engine.addMarker({
      id: "city",
      lng: 10,
      lat: 20,
      altitude: 0
    });
    engine.render();

    const report = typedEngine.getPerformanceReport();

    expect(report.fps).toBeGreaterThan(0);
    expect(report.frameTime).toBeGreaterThan(0);
    expect(report.metrics.get("renderCount")?.value).toBeGreaterThan(0);
    expect(report.metrics.get("layerCount")?.value).toBeGreaterThan(0);
    expect(report.metrics.get("sceneObjectCount")?.value).toBeGreaterThan(0);

    engine.destroy();
  });
});
