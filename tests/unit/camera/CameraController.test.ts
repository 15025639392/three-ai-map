import { describe, expect, it } from "vitest";
import { CameraController } from "../../../src/camera/CameraController";

describe("CameraController", () => {
  it("should update and read back view", () => {
    const controller = new CameraController();

    controller.setView({ lng: 116.3975, lat: 39.9085, altitude: 1000000 });
    const view = controller.getView();

    expect(view.lng).toBeCloseTo(116.3975, 4);
    expect(view.lat).toBeCloseTo(39.9085, 4);
    expect(view.altitude).toBe(1000000);
  });
});
