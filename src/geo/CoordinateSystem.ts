import type { Cartesian3Like } from "./cartographic";
import { WGS84_ELLIPSOID } from "./ellipsoid";
import { cartographicToCartesian } from "./projection";

export interface Cartesian3 extends Cartesian3Like {}

export class CoordinateSystem {
  constructor(private readonly ellipsoid = WGS84_ELLIPSOID) {}

  wgs84ToCartesian(lng: number, lat: number, height = 0): Cartesian3 {
    return cartographicToCartesian(
      {
        lng,
        lat,
        height
      },
      this.ellipsoid.radius
    );
  }
}
