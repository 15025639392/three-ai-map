import { GlobeEngine } from "../../src/engine/GlobeEngine";

class FakeRendererSystem {
  readonly renderer = { domElement: document.createElement("canvas") };
  readonly render = vi.fn();
  readonly setSize = vi.fn();
  readonly dispose = vi.fn();

  constructor(container: HTMLElement) {
    container.appendChild(this.renderer.domElement);
  }
}

describe("GlobeEngine render scheduling", () => {
  it("renders on demand instead of subscribing to a continuous loop", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const renderer = engine["rendererSystem"] as FakeRendererSystem;
    const initialCalls = renderer.render.mock.calls.length;

    expect(initialCalls).toBeGreaterThan(0);

    renderer.render.mockClear();
    engine.setView({ lng: 10, lat: 20, altitude: 3 });

    expect(renderer.render).toHaveBeenCalledTimes(1);

    engine.destroy();
  });

  it("coalesces multiple requestRender calls into a single animation frame", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });
    const renderer = engine["rendererSystem"] as FakeRendererSystem;
    let frameCallback: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 1;
      });

    renderer.render.mockClear();
    engine["requestRender"]();
    engine["requestRender"]();

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();

    expect(frameCallback).not.toBeNull();
    frameCallback!(16);

    expect(renderer.render).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    engine.destroy();
  });
});
