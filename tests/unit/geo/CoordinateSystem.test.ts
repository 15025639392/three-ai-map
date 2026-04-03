import { describe, expect, it } from "vitest";
import { CoordinateSystem } from "../../../src/geo/CoordinateSystem";

describe("CoordinateSystem", () => {
  it("should convert wgs84 to cartesian", () => {
    const coordinateSystem = new CoordinateSystem();
    const result = coordinateSystem.wgs84ToCartesian(0, 0, 0);

    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBe(0);
  });
});
