const { runBasicGlobe } = vi.hoisted(() => ({
  runBasicGlobe: vi.fn()
}));

vi.mock("../examples/basic-globe", () => ({
  runBasicGlobe
}));

import { mountApp } from "../src/main";

describe("mountApp", () => {
  it("renders the scaffold headline", () => {
    const container = document.createElement("div");

    mountApp(container);

    expect(container.textContent).toContain("Three.js Globe Engine");
    expect(container.querySelector("main")).not.toBeNull();
    expect(runBasicGlobe).toHaveBeenCalledTimes(1);
  });
});
