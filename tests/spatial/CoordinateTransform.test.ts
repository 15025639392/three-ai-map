import { describe, it, expect } from 'vitest';
import {
  wgs84ToGcj02,
  gcj02ToWgs84,
  gcj02ToBd09,
  bd09ToGcj02,
  wgs84ToBd09,
  bd09ToWgs84
} from '../../src/spatial/CoordinateTransform';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('CoordinateTransform', () => {
  describe('WGS84 <-> GCJ02', () => {
    it('transforms WGS84 to GCJ02 (Beijing)', () => {
      const wgs84: Coordinate = { lng: 116.404, lat: 39.915 };
      const gcj02 = wgs84ToGcj02(wgs84);
      
      expect(gcj02.lng).toBeGreaterThan(116.4);
      expect(gcj02.lng).toBeLessThan(116.42);
      expect(gcj02.lat).toBeGreaterThan(39.91);
      expect(gcj02.lat).toBeLessThan(39.92);
    });

    it('transforms GCJ02 back to WGS84', () => {
      const wgs84: Coordinate = { lng: 116.404, lat: 39.915 };
      const gcj02 = wgs84ToGcj02(wgs84);
      const wgs84Back = gcj02ToWgs84(gcj02);
      
      expect(Math.abs(wgs84Back.lng - wgs84.lng)).toBeLessThan(0.00001);
      expect(Math.abs(wgs84Back.lat - wgs84.lat)).toBeLessThan(0.00001);
    });

    it('handles coordinates outside China (no transformation)', () => {
      const wgs84: Coordinate = { lng: 0, lat: 0 };
      const gcj02 = wgs84ToGcj02(wgs84);
      
      expect(gcj02.lng).toBeCloseTo(wgs84.lng, 6);
      expect(gcj02.lat).toBeCloseTo(wgs84.lat, 6);
    });

    it('handles coordinates in China', () => {
      const shanghai: Coordinate = { lng: 121.474, lat: 31.230 };
      const gcj02 = wgs84ToGcj02(shanghai);
      
      expect(gcj02.lng).not.toBeCloseTo(shanghai.lng, 4);
      expect(gcj02.lat).not.toBeCloseTo(shanghai.lat, 4);
    });
  });

  describe('GCJ02 <-> BD09', () => {
    it('transforms GCJ02 to BD09 (Beijing)', () => {
      const gcj02: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = gcj02ToBd09(gcj02);
      
      expect(bd09.lng).toBeGreaterThan(gcj02.lng);
      expect(bd09.lng).toBeLessThan(gcj02.lng + 0.01);
      expect(bd09.lat).toBeGreaterThan(gcj02.lat);
      expect(bd09.lat).toBeLessThan(gcj02.lat + 0.01);
    });

    it('transforms BD09 back to GCJ02', () => {
      const gcj02: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = gcj02ToBd09(gcj02);
      const gcj02Back = bd09ToGcj02(bd09);
      
      expect(Math.abs(gcj02Back.lng - gcj02.lng)).toBeLessThan(0.000001);
      expect(Math.abs(gcj02Back.lat - gcj02.lat)).toBeLessThan(0.000001);
    });
  });

  describe('WGS84 <-> BD09 (direct)', () => {
    it('transforms WGS84 to BD09', () => {
      const wgs84: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = wgs84ToBd09(wgs84);
      
      expect(bd09.lng).not.toBeCloseTo(wgs84.lng, 4);
      expect(bd09.lat).not.toBeCloseTo(wgs84.lat, 4);
    });

    it('transforms BD09 back to WGS84', () => {
      const wgs84: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = wgs84ToBd09(wgs84);
      const wgs84Back = bd09ToWgs84(bd09);
      
      expect(Math.abs(wgs84Back.lng - wgs84.lng)).toBeLessThan(0.00001);
      expect(Math.abs(wgs84Back.lat - wgs84.lat)).toBeLessThan(0.00001);
    });
  });

  describe('round-trip accuracy', () => {
    it('maintains precision through WGS84 -> GCJ02 -> WGS84', () => {
      const original: Coordinate = { lng: 116.404, lat: 39.915 };
      const gcj02 = wgs84ToGcj02(original);
      const back = gcj02ToWgs84(gcj02);
      
      expect(Math.abs(back.lng - original.lng)).toBeLessThan(0.00001);
      expect(Math.abs(back.lat - original.lat)).toBeLessThan(0.00001);
    });

    it('maintains precision through GCJ02 -> BD09 -> GCJ02', () => {
      const original: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = gcj02ToBd09(original);
      const back = bd09ToGcj02(bd09);
      
      expect(Math.abs(back.lng - original.lng)).toBeLessThan(0.000001);
      expect(Math.abs(back.lat - original.lat)).toBeLessThan(0.000001);
    });

    it('maintains precision through WGS84 -> BD09 -> WGS84', () => {
      const original: Coordinate = { lng: 116.404, lat: 39.915 };
      const bd09 = wgs84ToBd09(original);
      const back = bd09ToWgs84(bd09);
      
      expect(Math.abs(back.lng - original.lng)).toBeLessThan(0.00001);
      expect(Math.abs(back.lat - original.lat)).toBeLessThan(0.00001);
    });
  });

  describe('edge cases', () => {
    it('handles negative longitude', () => {
      const wgs84: Coordinate = { lng: -116.404, lat: 39.915 };
      const gcj02 = wgs84ToGcj02(wgs84);
      
      expect(gcj02.lng).toBeCloseTo(wgs84.lng, 6);
      expect(gcj02.lat).toBeCloseTo(wgs84.lat, 6);
    });

    it('handles coordinates at poles', () => {
      const wgs84: Coordinate = { lng: 0, lat: 85 };
      const gcj02 = wgs84ToGcj02(wgs84);
      
      expect(gcj02.lng).toBeCloseTo(wgs84.lng, 6);
      expect(gcj02.lat).toBeCloseTo(wgs84.lat, 6);
    });

    it('handles coordinates at international date line', () => {
      const wgs84: Coordinate = { lng: 180, lat: 0 };
      const gcj02 = wgs84ToGcj02(wgs84);
      
      expect(gcj02.lng).toBeCloseTo(wgs84.lng, 6);
      expect(gcj02.lat).toBeCloseTo(wgs84.lat, 6);
    });
  });
});
