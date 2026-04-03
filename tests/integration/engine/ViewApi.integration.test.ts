import { describe, expect, it, vi } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";

describe("View API", () => {
  it("should update and read back view", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);

    requestAnimationFrameSpy.mockClear();

    engine.setView({ lng: 116.3975, lat: 39.9085, altitude: 1000000 });
    const view = engine.getView();

    expect(view.lng).toBeCloseTo(116.3975, 4);
    expect(view.lat).toBeCloseTo(39.9085, 4);
    expect(view.altitude).toBe(1000000);
    expect(requestAnimationFrameSpy).toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
    engine.dispose();
  });
});
