import { GlobeEngine } from "../../src/engine/GlobeEngine";

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
});
