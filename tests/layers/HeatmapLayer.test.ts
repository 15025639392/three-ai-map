import { describe, it, expect } from 'vitest';
import { HeatmapLayer } from '../../src/layers/HeatmapLayer';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('HeatmapLayer', () => {
  it('creates a heatmap layer', () => {
    const layer = new HeatmapLayer();
    expect(layer).toBeDefined();
  });

  it('adds points to the heatmap', () => {
    const layer = new HeatmapLayer();
    
    layer.addPoint({
      position: { lng: 116.404, lat: 39.915 },
      intensity: 1
    });
    
    expect(layer.getPointCount()).toBe(1);
  });

  it('calculates heatmap intensity', () => {
    const layer = new HeatmapLayer({
      radius: 0.01
    });
    
    // Add concentrated points
    for (let i = 0; i < 10; i++) {
      layer.addPoint({
        position: { lng: 116.404, lat: 39.915 },
        intensity: 1
      });
    }
    
    const intensity = layer.getIntensityAt({ lng: 116.404, lat: 39.915 });
    expect(intensity).toBeGreaterThan(0);
  });

  it('adds multiple points efficiently', () => {
    const layer = new HeatmapLayer();
    
    for (let i = 0; i < 1000; i++) {
      layer.addPoint({
        position: { lng: 116.404 + i * 0.001, lat: 39.915 + i * 0.001 },
        intensity: 1
      });
    }
    
    expect(layer.getPointCount()).toBe(1000);
  });

  it('removes points from heatmap', () => {
    const layer = new HeatmapLayer();
    
    const pointId = layer.addPoint({
      position: { lng: 116.404, lat: 39.915 },
      intensity: 1
    });
    
    layer.removePoint(pointId);
    expect(layer.getPointCount()).toBe(0);
  });

  it('clears all points', () => {
    const layer = new HeatmapLayer();
    
    for (let i = 0; i < 10; i++) {
      layer.addPoint({
        position: { lng: 116.404 + i * 0.1, lat: 39.915 + i * 0.1 },
        intensity: 1
      });
    }
    
    layer.clear();
    expect(layer.getPointCount()).toBe(0);
  });

  it('generates heatmap texture', () => {
    const layer = new HeatmapLayer({
      width: 256,
      height: 256
    });
    
    layer.addPoint({
      position: { lng: 116.404, lat: 39.915 },
      intensity: 1
    });
    
    const texture = layer.generateTexture();
    expect(texture).toBeDefined();
    expect(texture.width).toBe(256);
    expect(texture.height).toBe(256);
  });
});
