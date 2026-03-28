import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FrustumCuller } from '../../src/tiles/FrustumCuller';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('FrustumCuller', () => {
  it('creates a frustum culler', () => {
    const culler = new FrustumCuller();
    expect(culler).toBeDefined();
  });

  it('calculates frustum from camera', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    expect(culler.frustum).toBeDefined();
  });

  it('culls spheres outside frustum', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    
    const sphere = new THREE.Sphere(new THREE.Vector3(100, 100, 100), 1);
    const isVisible = culler.isSphereVisible(sphere);
    
    expect(isVisible).toBe(false);
  });

  it('keeps spheres inside frustum', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
    const isVisible = culler.isSphereVisible(sphere);
    
    expect(isVisible).toBe(true);
  });

  it('culls boxes outside frustum', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    
    const box = new THREE.Box3(
      new THREE.Vector3(100, 100, 100),
      new THREE.Vector3(101, 101, 101)
    );
    const isVisible = culler.isBoxVisible(box);
    
    expect(isVisible).toBe(false);
  });

  it('keeps boxes inside frustum', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    
    const box = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    );
    const isVisible = culler.isBoxVisible(box);
    
    expect(isVisible).toBe(true);
  });

  it('culls coordinates outside view', () => {
    const culler = new FrustumCuller();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 5);
    
    culler.updateFrustum(camera);
    
    // Far away coordinate (back side of sphere)
    const coord: Coordinate = { lng: 0, lat: 0 };
    const isVisible = culler.isCoordinateVisible(coord, 0.1);
    
    // Coordinate at (0, 0, 1) is behind camera at (0, 0, 5)
    expect(isVisible).toBe(false);
  });
});
