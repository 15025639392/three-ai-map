import { describe, it, expect } from 'vitest';
import {
  WebMercatorProjection,
  EquirectangularProjection,
  GeographicProjection,
  ProjectionType
} from '../../src/projection/Projection';

describe('WebMercatorProjection', () => {
  it('projects coordinate to world space', () => {
    const projection = new WebMercatorProjection();
    const world = projection.project({ lng: 0, lat: 0 });
    
    expect(world.x).toBe(0);
    expect(world.y).toBe(0);
    expect(world.z).toBeCloseTo(1, 6);
  });

  it('unprojects world space back to coordinate', () => {
    const projection = new WebMercatorProjection();
    const coord = { lng: 116.404, lat: 39.915 };
    const world = projection.project(coord);
    const back = projection.unproject(world);
    
    expect(back.lng).toBeCloseTo(coord.lng, 6);
    expect(back.lat).toBeCloseTo(coord.lat, 6);
  });

  it('clamps latitude to Mercator bounds', () => {
    const projection = new WebMercatorProjection();
    const world = projection.project({ lng: 0, lat: 90 });
    const back = projection.unproject(world);
    
    expect(back.lat).toBeLessThan(85.06);
    expect(back.lat).toBeGreaterThan(85.05);
  });

  it('handles tiles at zoom level 0', () => {
    const projection = new WebMercatorProjection();
    const tile = projection.getTileWorldPosition(0, 0, 0);
    
    expect(tile.x).toBe(-0.5);
    expect(tile.y).toBe(-0.5);
    expect(tile.scale).toBeCloseTo(1, 6);
  });
});

describe('EquirectangularProjection', () => {
  it('projects coordinate to world space', () => {
    const projection = new EquirectangularProjection();
    const world = projection.project({ lng: 0, lat: 0 });
    
    expect(world.x).toBeCloseTo(-0.5, 6);
    expect(world.y).toBeCloseTo(-0.5, 6);
    expect(world.z).toBeCloseTo(1, 6);
  });

  it('unprojects world space back to coordinate', () => {
    const projection = new EquirectangularProjection();
    const coord = { lng: 116.404, lat: 39.915 };
    const world = projection.project(coord);
    const back = projection.unproject(world);
    
    expect(back.lng).toBeCloseTo(coord.lng, 6);
    expect(back.lat).toBeCloseTo(coord.lat, 6);
  });

  it('allows full latitude range', () => {
    const projection = new EquirectangularProjection();
    const world = projection.project({ lng: 0, lat: 90 });
    const back = projection.unproject(world);
    
    expect(back.lat).toBeCloseTo(90, 6);
  });

  it('handles tiles at zoom level 0', () => {
    const projection = new EquirectangularProjection();
    const tile = projection.getTileWorldPosition(0, 0, 0);
    
    expect(tile.x).toBe(-0.5);
    expect(tile.y).toBe(-0.5);
    expect(tile.scale).toBeCloseTo(1, 6);
  });
});

describe('GeographicProjection', () => {
  it('projects coordinate to world space on sphere', () => {
    const projection = new GeographicProjection();
    const world = projection.project({ lng: 0, lat: 0 });
    
    expect(world.x).toBeCloseTo(0, 6);
    expect(world.y).toBeCloseTo(0, 6);
    expect(world.z).toBeCloseTo(1, 6);
  });

  it('unprojects world space back to coordinate', () => {
    const projection = new GeographicProjection();
    const coord = { lng: 116.404, lat: 39.915 };
    const world = projection.project(coord);
    const back = projection.unproject(world);
    
    expect(back.lng).toBeCloseTo(coord.lng, 6);
    expect(back.lat).toBeCloseTo(coord.lat, 6);
  });

  it('maintains spherical distance', () => {
    const projection = new GeographicProjection();
    const world1 = projection.project({ lng: 0, lat: 0 });
    const world2 = projection.project({ lng: 90, lat: 0 });
    
    const dx = world2.x - world1.x;
    const dy = world2.y - world1.y;
    const dz = world2.z - world1.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    expect(distance).toBeGreaterThan(1.3);
    expect(distance).toBeLessThan(1.5);
  });

  it('handles tiles at zoom level 0', () => {
    const projection = new GeographicProjection();
    const tile = projection.getTileWorldPosition(0, 0, 0);
    
    expect(tile.x).toBeGreaterThan(-1);
    expect(tile.y).toBeGreaterThan(-1);
    expect(tile.scale).toBeGreaterThan(0);
  });
});

describe('ProjectionType', () => {
  it('correctly identifies projection types', () => {
    expect(WebMercatorProjection.type).toBe(ProjectionType.WebMercator);
    expect(EquirectangularProjection.type).toBe(ProjectionType.Equirectangular);
    expect(GeographicProjection.type).toBe(ProjectionType.Geographic);
  });
});
