import { describe, expect, it } from "vitest";
import { RendererSystem } from "../../../src/scene/RendererSystem";

describe("RendererSystem", () => {
  it("should create renderer canvas", () => {
    const container = document.createElement("div");
    const renderer = new RendererSystem({ container });

    expect(container.querySelector("canvas")).toBeTruthy();
    renderer.dispose();
  });
});
