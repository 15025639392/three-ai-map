const { runBasicGlobe } = vi.hoisted(() => ({
  runBasicGlobe: vi.fn()
}));

vi.mock("../examples/basic-globe", () => ({
  runBasicGlobe
}));

import { mountApp } from "../src/main";

describe("mountApp", () => {
  it("renders the scaffold headline", async () => {
    const container = document.createElement("div");

    await mountApp(container);

    expect(container.textContent).toContain("Globe Engine Demo");
    expect(container.querySelector("main")).not.toBeNull();
    expect(container.querySelector(".city-list")).not.toBeNull();
    expect(container.querySelector(".route-list")).not.toBeNull();
    expect(runBasicGlobe).toHaveBeenCalledTimes(1);
  });
});
