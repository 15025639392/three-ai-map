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

describe("GlobeEngine third phase integration", () => {
  it("creates terrain and atmosphere by default", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 600 });
    const engine = new GlobeEngine({
      container,
      rendererFactory: ({ container: host }) => new FakeRendererSystem(host)
    });

    expect(engine.sceneSystem.scene.children.length).toBeGreaterThanOrEqual(4);

    engine.destroy();
  });
});
