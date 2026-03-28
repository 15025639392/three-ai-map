import { describe, it, expect } from "vitest";
import { pointInPolygon, distanceToLine, distanceToSegment, bearing } from "../../src/spatial/Relation";

describe("Relation", () => {
  it("checks if point is in polygon", () => {
    const result = pointInPolygon(
      { lng: 0.5, lat: 0.5 },
      [{ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, { lng: 1, lat: 1 }, { lng: 0, lat: 1 }]
    );
    expect(result).toBe(true);
  });

  it("returns false for point outside polygon", () => {
    const result = pointInPolygon(
      { lng: 1.5, lat: 0.5 },
      [{ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, { lng: 1, lat: 1 }, { lng: 0, lat: 1 }]
    );
    expect(result).toBe(false);
  });

  it("calculates distance from point to line", () => {
    const distance = distanceToLine(
      { lng: 0.5, lat: 0.5 },
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 }
    );
    expect(distance).toBeGreaterThan(55000);
    expect(distance).toBeLessThan(56000);
  });

  it("calculates distance from point to segment", () => {
    const distance = distanceToSegment(
      { lng: 0.5, lat: 0.5 },
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 }
    );
    expect(distance).toBeGreaterThan(0);
  });

  it("calculates distance from point on the segment", () => {
    const distance = distanceToSegment(
      { lng: 0.5, lat: 0 },
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 }
    );
    expect(distance).toBeCloseTo(0, 10);
  });

  it("calculates bearing between two points", () => {
    const brg = bearing(
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 }
    );
    expect(brg).toBeCloseTo(90, 1); // east direction
  });

  it("calculates bearing to north", () => {
    const brg = bearing(
      { lng: 0, lat: 0 },
      { lng: 0, lat: 1 }
    );
    expect(brg).toBeCloseTo(0, 1); // north direction
  });

  it("calculates bearing to south", () => {
    const brg = bearing(
      { lng: 0, lat: 1 },
      { lng: 0, lat: 0 }
    );
    expect(brg).toBeCloseTo(180, 1); // south direction
  });

  it("handles point exactly on polygon boundary", () => {
    const result = pointInPolygon(
      { lng: 0, lat: 0.5 },
      [{ lng: 0, lat: 0 }, { lng: 1, lat: 0 }, { lng: 1, lat: 1 }, { lng: 0, lat: 1 }]
    );
    expect(result).toBe(true);
  });
});
