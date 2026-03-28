import { describe, it, expect } from 'vitest';
import { ClusterLayer } from '../../src/layers/ClusterLayer';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('ClusterLayer', () => {
  it('creates a cluster layer', () => {
    const layer = new ClusterLayer();
    expect(layer).toBeDefined();
  });

  it('adds items to the cluster', () => {
    const layer = new ClusterLayer();
    
    layer.addItem({
      id: '1',
      position: { lng: 116.404, lat: 39.915 }
    });
    
    expect(layer.getItemCount()).toBe(1);
  });

  it('clusters nearby items', () => {
    const layer = new ClusterLayer({
      clusterRadius: 0.01 // ~1km
    });
    
    // Add items close together
    for (let i = 0; i < 10; i++) {
      layer.addItem({
        id: `${i}`,
        position: { lng: 116.404 + i * 0.001, lat: 39.915 + i * 0.001 }
      });
    }
    
    const clusters = layer.getClusters();
    expect(clusters.length).toBeLessThan(10);
  });

  it('calculates cluster size', () => {
    const layer = new ClusterLayer({
      clusterRadius: 0.01
    });
    
    for (let i = 0; i < 10; i++) {
      layer.addItem({
        id: `${i}`,
        position: { lng: 116.404 + i * 0.0001, lat: 39.915 + i * 0.0001 }
      });
    }
    
    const clusters = layer.getClusters();
    expect(clusters[0].size).toBe(10);
  });

  it('removes items from cluster', () => {
    const layer = new ClusterLayer();
    
    layer.addItem({
      id: '1',
      position: { lng: 116.404, lat: 39.915 }
    });
    
    layer.removeItem('1');
    expect(layer.getItemCount()).toBe(0);
  });

  it('updates cluster on zoom change', () => {
    const layer = new ClusterLayer({
      clusterRadius: 0.1
    });
    
    // Add items in two groups
    for (let i = 0; i < 5; i++) {
      layer.addItem({
        id: `a${i}`,
        position: { lng: 116.404 + i * 0.001, lat: 39.915 + i * 0.001 }
      });
    }
    
    for (let i = 0; i < 5; i++) {
      layer.addItem({
        id: `b${i}`,
        position: { lng: 116.514 + i * 0.001, lat: 39.915 + i * 0.001 }
      });
    }
    
    const clusters1 = layer.getClusters({ zoom: 8 }); // Low zoom, more clustering
    const clusters2 = layer.getClusters({ zoom: 15 }); // High zoom, less clustering
    
    // At low zoom, items should cluster more
    // At high zoom, items should be more separate
    expect(clusters1.length).toBeLessThan(10);
    expect(clusters2.length).toBeGreaterThan(1);
  });

  it('clears all items', () => {
    const layer = new ClusterLayer();
    
    for (let i = 0; i < 10; i++) {
      layer.addItem({
        id: `${i}`,
        position: { lng: 116.404 + i * 0.1, lat: 39.915 + i * 0.1 }
      });
    }
    
    layer.clear();
    expect(layer.getItemCount()).toBe(0);
  });
});
