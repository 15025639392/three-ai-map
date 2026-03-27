export const WGS84_RADIUS = 6378137;

export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function normalizeLongitude(lng: number): number {
  const normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}
