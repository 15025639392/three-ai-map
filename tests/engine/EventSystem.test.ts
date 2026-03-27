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
});
