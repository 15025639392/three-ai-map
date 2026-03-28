import { describe, it, expect } from "vitest";
import { haversineDistance, greatCircleDistance } from "../../src/spatial/Distance";

describe("Distance", () => {
  it("calculates haversine distance between two coordinates", () => {
    const distance = haversineDistance(
      { lng: 0, lat: 0 },
      { lng: 0, lat: 1 }
    );
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(120000);
  });

  it("calculates haversine distance across multiple degrees", () => {
    const distance = haversineDistance(
      { lng: 0, lat: 0 },
      { lng: 0, lat: 10 }
    );
    expect(distance).toBeGreaterThan(1100000);
    expect(distance).toBeLessThan(1200000);
  });

  it("calculates haversine distance at different longitudes", () => {
    const distance = haversineDistance(
      { lng: 0, lat: 0 },
      { lng: 90, lat: 0 }
    );
    expect(distance).toBeGreaterThan(10000000);
    expect(distance).toBeLessThan(10100000);
  });

  it("calculates great circle distance between two coordinates", () => {
    const distance = greatCircleDistance(
      { lng: 0, lat: 0 },
      { lng: 90, lat: 0 }
    );
    expect(distance).toBeGreaterThan(10000000);
    expect(distance).toBeLessThan(10100000);
  });

  it("calculates great circle distance between antipodal points", () => {
    const distance = greatCircleDistance(
      { lng: 0, lat: 0 },
      { lng: 180, lat: 0 }
    );
    expect(distance).toBeGreaterThan(20000000);
    expect(distance).toBeLessThan(20100000);
  });

  it("returns same distance for both methods at short distances", () => {
    const coord1 = { lng: 116.404, lat: 39.915 };
    const coord2 = { lng: 116.414, lat: 39.925 };
    const haversine = haversineDistance(coord1, coord2);
    const greatCircle = greatCircleDistance(coord1, coord2);
    expect(Math.abs(haversine - greatCircle)).toBeLessThan(0.01);
  });
});
