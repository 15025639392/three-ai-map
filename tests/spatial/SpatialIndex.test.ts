import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../../src/spatial/SpatialIndex';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('SpatialIndex', () => {
  it('creates a spatial index', () => {
    const index = new SpatialIndex();
    expect(index).toBeDefined();
  });

  it('inserts items into the index', () => {
    const index = new SpatialIndex();
    
    index.insert({
      id: '1',
      bounds: {
        min: { lng: -1, lat: -1 },
        max: { lng: 1, lat: 1 }
      }
    });
    
    expect(index.size()).toBe(1);
  });

  it('removes items from the index', () => {
    const index = new SpatialIndex();
    
    index.insert({
      id: '1',
      bounds: {
        min: { lng: -1, lat: -1 },
        max: { lng: 1, lat: 1 }
      }
    });
    
    index.remove('1');
    expect(index.size()).toBe(0);
  });

  it('queries items by point', () => {
    const index = new SpatialIndex();
    
    index.insert({
      id: '1',
      bounds: {
        min: { lng: -1, lat: -1 },
        max: { lng: 1, lat: 1 }
      }
    });
    
    const results = index.queryPoint({ lng: 0, lat: 0 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('queries items by bounds', () => {
    const index = new SpatialIndex();
    
    index.insert({
      id: '1',
      bounds: {
        min: { lng: -1, lat: -1 },
        max: { lng: 1, lat: 1 }
      }
    });
    
    index.insert({
      id: '2',
      bounds: {
        min: { lng: 2, lat: 2 },
        max: { lng: 3, lat: 3 }
      }
    });
    
    const results = index.queryBounds({
      min: { lng: -0.5, lat: -0.5 },
      max: { lng: 0.5, lat: 0.5 }
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('clears all items', () => {
    const index = new SpatialIndex();
    
    for (let i = 0; i < 10; i++) {
      index.insert({
        id: `${i}`,
        bounds: {
          min: { lng: -1, lat: -1 },
          max: { lng: 1, lat: 1 }
        }
      });
    }
    
    index.clear();
    expect(index.size()).toBe(0);
  });

  it('updates item bounds', () => {
    const index = new SpatialIndex();
    
    index.insert({
      id: '1',
      bounds: {
        min: { lng: -1, lat: -1 },
        max: { lng: 1, lat: 1 }
      }
    });
    
    index.update('1', {
      min: { lng: 5, lat: 5 },
      max: { lng: 6, lat: 6 }
    });
    
    const results = index.queryPoint({ lng: 5.5, lat: 5.5 });
    expect(results).toHaveLength(1);
  });
});
