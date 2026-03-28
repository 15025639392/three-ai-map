import { describe, it, expect } from "vitest";
import { polygonArea, sphericalPolygonArea } from "../../src/spatial/Area";

describe("Area", () => {
  it("calculates polygon area", () => {
    const area = polygonArea([
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      { lng: 1, lat: 1 },
      { lng: 0, lat: 1 }
    ]);
    expect(area).toBeGreaterThan(0);
  });

  it("calculates polygon area for larger polygon", () => {
    const area = polygonArea([
      { lng: 0, lat: 0 },
      { lng: 10, lat: 0 },
      { lng: 10, lat: 10 },
      { lng: 0, lat: 10 }
    ]);
    expect(area).toBeGreaterThan(0);
  });

  it("calculates spherical polygon area", () => {
    const area = sphericalPolygonArea([
      { lng: 0, lat: 0 },
      { lng: 90, lat: 0 },
      { lng: 45, lat: 45 }
    ]);
    expect(area).toBeGreaterThan(0);
  });

  it("handles polygon with many vertices", () => {
    const coordinates = [];
    for (let i = 0; i < 10; i++) {
      coordinates.push({
        lng: Math.cos(i * Math.PI / 5) * 5,
        lat: Math.sin(i * Math.PI / 5) * 5
      });
    }
    const area = polygonArea(coordinates);
    expect(area).toBeGreaterThan(0);
  });

  it("calculates same area regardless of starting vertex", () => {
    const coords = [
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      { lng: 1, lat: 1 },
      { lng: 0, lat: 1 }
    ];
    const area1 = polygonArea(coords);
    const area2 = polygonArea([coords[1], coords[2], coords[3], coords[0]]);
    expect(area1).toBeCloseTo(area2, 100);
  });
});
