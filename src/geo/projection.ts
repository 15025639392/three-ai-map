import { Cartesian3Like, Cartographic } from "./cartographic";
import { clampLatitude, normalizeLongitude } from "./ellipsoid";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function cartographicToCartesian(
  cartographic: Cartographic,
  radius: number
): Cartesian3Like {
  const lng = toRadians(normalizeLongitude(cartographic.lng));
  const lat = toRadians(clampLatitude(cartographic.lat));
  const radialDistance = radius + cartographic.height;
  const cosLat = Math.cos(lat);

  return {
    x: radialDistance * cosLat * Math.cos(lng),
    y: radialDistance * Math.sin(lat),
    z: -radialDistance * cosLat * Math.sin(lng)
  };
}

export function cartesianToCartographic(
  cartesian: Cartesian3Like,
  radius: number
): Cartographic {
  const radialDistance = Math.sqrt(
    cartesian.x * cartesian.x + cartesian.y * cartesian.y + cartesian.z * cartesian.z
  );

  if (radialDistance === 0) {
    throw new Error("Cannot convert the zero vector to cartographic coordinates");
  }

  return {
    lng: normalizeLongitude(toDegrees(Math.atan2(-cartesian.z, cartesian.x))),
    lat: clampLatitude(toDegrees(Math.asin(cartesian.y / radialDistance))),
    height: radialDistance - radius
  };
}
