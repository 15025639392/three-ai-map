export interface ENUAxes {
  east: { x: number; y: number; z: number };
  north: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function createEastNorthUpAxes(lng: number, lat: number): ENUAxes {
  const lngRad = toRadians(lng);
  const latRad = toRadians(lat);
  const cosLng = Math.cos(lngRad);
  const sinLng = Math.sin(lngRad);
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);

  return {
    east: { x: -sinLng, y: 0, z: -cosLng },
    north: { x: -sinLat * cosLng, y: cosLat, z: sinLat * sinLng },
    up: { x: cosLat * cosLng, y: sinLat, z: -cosLat * sinLng }
  };
}
