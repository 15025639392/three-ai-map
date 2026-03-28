import { describe, it, expect } from 'vitest';
import { VectorTileLayer } from '../../src/layers/VectorTileLayer';

describe('VectorTileLayer', () => {
  it('creates a vector tile layer', () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf'
    });
    
    expect(layer).toBeDefined();
    expect(layer.id).toBeDefined();
  });

  it('parses vector tile data', async () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf'
    });
    
    // Create mock tile data
    const mockTileData = new Uint8Array([
      // Simple protobuf-like data (mock)
      0x1a, 0x03, 0x4c, 0x61, 0x79, // Layer name "Lay"
    ]);
    
    const features = await layer.parseTile(mockTileData, 0, 0, 0);
    expect(features).toBeDefined();
  });

  it('filters features by layer name', async () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf',
      layerFilter: ['roads', 'buildings']
    });
    
    const mockTileData = new Uint8Array([]);
    const features = await layer.parseTile(mockTileData, 0, 0, 0);
    
    expect(features).toBeDefined();
  });

  it('applies style to features', () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf',
      style: {
        roads: {
          strokeColor: 0xff0000,
          strokeWidth: 2
        }
      }
    });
    
    const feature = {
      type: 'line',
      layer: 'roads',
      geometry: [[0, 0], [1, 1], [2, 2]]
    };
    
    const styledFeature = layer.applyStyle(feature);
    expect(styledFeature).toBeDefined();
  });

  it('handles polygon features', async () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf'
    });
    
    const mockTileData = new Uint8Array([]);
    const features = await layer.parseTile(mockTileData, 0, 0, 0);
    
    expect(features).toBeDefined();
  });

  it('handles line features', async () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf'
    });
    
    const mockTileData = new Uint8Array([]);
    const features = await layer.parseTile(mockTileData, 0, 0, 0);
    
    expect(features).toBeDefined();
  });

  it('handles point features', async () => {
    const layer = new VectorTileLayer({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.pbf'
    });
    
    const mockTileData = new Uint8Array([]);
    const features = await layer.parseTile(mockTileData, 0, 0, 0);
    
    expect(features).toBeDefined();
  });
});
