import { Coordinate } from './SpatialMath';

// Constants for coordinate transformation
const X_PI = Math.PI * 3000.0 / 180.0;
const PI = Math.PI;
const a = 6378245.0; // 长半轴
const ee = 0.00669342162296594323; // 扁率

// Determine if a point is in China (for GCJ02 transformation)
function isInChina(lng: number, lat: number): boolean {
  if (lng < 72.004 || lng > 137.8347) return false;
  if (lat < 0.8293 || lat > 55.8271) return false;
  return true;
}

// Transform lon, lat to deviant in GCJ02
function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

// Transform lon, lat to deviant in GCJ02
function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

// Transform WGS84 to GCJ02
export function wgs84ToGcj02(coord: Coordinate): Coordinate {
  if (!isInChina(coord.lng, coord.lat)) {
    return { ...coord };
  }

  let dLat = transformLat(coord.lng - 105.0, coord.lat - 35.0);
  let dLon = transformLon(coord.lng - 105.0, coord.lat - 35.0);
  const radLat = coord.lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
  dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
  
  return {
    lng: coord.lng + dLon,
    lat: coord.lat + dLat
  };
}

// Transform GCJ02 to WGS84 (approximate)
export function gcj02ToWgs84(coord: Coordinate): Coordinate {
  if (!isInChina(coord.lng, coord.lat)) {
    return { ...coord };
  }

  const gcj02 = wgs84ToGcj02(coord);
  const dLon = gcj02.lng - coord.lng;
  const dLat = gcj02.lat - coord.lat;
  
  return {
    lng: coord.lng * 2 - gcj02.lng,
    lat: coord.lat * 2 - gcj02.lat
  };
}

// Transform GCJ02 to BD09
export function gcj02ToBd09(coord: Coordinate): Coordinate {
  const z = Math.sqrt(coord.lng * coord.lng + coord.lat * coord.lat) + 0.00002 * Math.sin(coord.lat * X_PI);
  const theta = Math.atan2(coord.lat, coord.lng) + 0.000003 * Math.cos(coord.lng * X_PI);
  
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006
  };
}

// Transform BD09 to GCJ02
export function bd09ToGcj02(coord: Coordinate): Coordinate {
  const x = coord.lng - 0.0065;
  const y = coord.lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  
  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta)
  };
}

// Transform WGS84 to BD09 (through GCJ02)
export function wgs84ToBd09(coord: Coordinate): Coordinate {
  const gcj02 = wgs84ToGcj02(coord);
  return gcj02ToBd09(gcj02);
}

// Transform BD09 to WGS84 (through GCJ02)
export function bd09ToWgs84(coord: Coordinate): Coordinate {
  const gcj02 = bd09ToGcj02(coord);
  return gcj02ToWgs84(gcj02);
}
