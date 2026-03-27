import { cartesianToCartographic, cartographicToCartesian } from "../../src/geo/projection";

describe("projection", () => {
  it("converts lng lat height to cartesian coordinates on the globe", () => {
    const point = cartographicToCartesian({ lng: 0, lat: 0, height: 0 }, 1);

    expect(point.x).toBeCloseTo(1);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });

  it("converts cartesian coordinates back to lng lat height", () => {
    const cartographic = cartesianToCartographic({ x: 0, y: 1, z: 0 }, 1);

    expect(cartographic.lng).toBeCloseTo(0);
    expect(cartographic.lat).toBeCloseTo(90);
    expect(cartographic.height).toBeCloseTo(0);
  });
});
