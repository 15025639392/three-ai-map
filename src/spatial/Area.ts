import { Coordinate, toRadians } from "./SpatialMath";

export function polygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) {
    return 0;
  }

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = coordinates[i].lng * toRadians(1);
    const y1 = coordinates[i].lat * toRadians(1);
    const x2 = coordinates[j].lng * toRadians(1);
    const y2 = coordinates[j].lat * toRadians(1);

    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

export function sphericalPolygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) {
    return 0;
  }

  const R = 6371000; // Earth's radius in meters
  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRadians(coordinates[i].lat);
    const lng1 = toRadians(coordinates[i].lng);
    const lat2 = toRadians(coordinates[j].lat);
    const lng2 = toRadians(coordinates[j].lng);

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs(area * R * R / 2);

  return area;
}
