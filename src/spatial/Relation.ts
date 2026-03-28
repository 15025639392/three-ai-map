import { Coordinate, toRadians, toDegrees } from "./SpatialMath";
import { haversineDistance } from "./Distance";

export function pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    if (yi > point.lat !== yj > point.lat) {
      const intersectX = (xj - xi) * (point.lat - yi) / (yj - yi) + xi;
      if (point.lng < intersectX) {
        inside = !inside;
      }
    }
  }

  return inside;
}

export function distanceToLine(point: Coordinate, lineStart: Coordinate, lineEnd: Coordinate): number {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let closestLat: number;
  let closestLng: number;

  if (param < 0) {
    closestLat = lineStart.lat;
    closestLng = lineStart.lng;
  } else if (param > 1) {
    closestLat = lineEnd.lat;
    closestLng = lineEnd.lng;
  } else {
    closestLat = lineStart.lat + param * C;
    closestLng = lineStart.lng + param * D;
  }

  return haversineDistance(point, { lat: closestLat, lng: closestLng });
}

export function distanceToSegment(point: Coordinate, segmentStart: Coordinate, segmentEnd: Coordinate): number {
  return distanceToLine(point, segmentStart, segmentEnd);
}

export function bearing(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const brng = Math.atan2(y, x);
  return (toDegrees(brng) + 360) % 360;
}
