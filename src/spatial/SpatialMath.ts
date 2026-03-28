export interface Coordinate {
  lng: number;
  lat: number;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function normalizeAngle(angle: number): number {
  return angle - Math.floor(angle / 360) * 360;
}

export function normalizeLongitude(lng: number): number {
  return normalizeAngle((lng + 540) % 360 - 180);
}

export function normalizeLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function clampLatitude(lat: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, lat));
}
