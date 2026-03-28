import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { InstancedMarkerLayer } from '../../src/layers/InstancedMarkerLayer';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('InstancedMarkerLayer', () => {
  it('creates an instanced marker layer', () => {
    const layer = new InstancedMarkerLayer();
    expect(layer).toBeDefined();
    expect(layer.id).toBeDefined();
  });

  it('adds markers to the layer', () => {
    const layer = new InstancedMarkerLayer();
    
    layer.addMarker({
      position: { lng: 116.404, lat: 39.915 },
      color: 0xff0000,
      size: 1
    });
    
    expect(layer.getMarkerCount()).toBe(1);
  });

  it('adds multiple markers efficiently', () => {
    const layer = new InstancedMarkerLayer();
    
    for (let i = 0; i < 1000; i++) {
      layer.addMarker({
        position: { lng: i * 0.1, lat: i * 0.1 },
        color: 0xff0000,
        size: 1
      });
    }
    
    expect(layer.getMarkerCount()).toBe(1000);
  });

  it('removes markers from the layer', () => {
    const layer = new InstancedMarkerLayer();
    
    const markerId = layer.addMarker({
      position: { lng: 116.404, lat: 39.915 },
      color: 0xff0000,
      size: 1
    });
    
    layer.removeMarker(markerId);
    expect(layer.getMarkerCount()).toBe(0);
  });

  it('updates marker properties', () => {
    const layer = new InstancedMarkerLayer();
    
    const markerId = layer.addMarker({
      position: { lng: 116.404, lat: 39.915 },
      color: 0xff0000,
      size: 1
    });
    
    layer.updateMarker(markerId, {
      color: 0x00ff00,
      size: 2
    });
    
    expect(layer.getMarkerCount()).toBe(1);
  });

  it('clears all markers', () => {
    const layer = new InstancedMarkerLayer();
    
    for (let i = 0; i < 10; i++) {
      layer.addMarker({
        position: { lng: i * 0.1, lat: i * 0.1 },
        color: 0xff0000,
        size: 1
      });
    }
    
    layer.clear();
    expect(layer.getMarkerCount()).toBe(0);
  });

  it('creates instanced mesh for rendering', () => {
    const layer = new InstancedMarkerLayer();
    
    layer.addMarker({
      position: { lng: 116.404, lat: 39.915 },
      color: 0xff0000,
      size: 1
    });
    
    const instancedMesh = layer.createInstancedMesh();
    expect(instancedMesh).toBeDefined();
    expect(instancedMesh).toBeInstanceOf(THREE.InstancedMesh);
  });
});
