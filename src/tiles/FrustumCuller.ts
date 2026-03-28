import * as THREE from 'three';
import { Coordinate, toRadians } from '../spatial/SpatialMath';

export class FrustumCuller {
  frustum: THREE.Frustum | undefined;
  private matrix: THREE.Matrix4 = new THREE.Matrix4();
  
  updateFrustum(camera: THREE.Camera): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum = new THREE.Frustum();
    this.frustum.setFromProjectionMatrix(this.matrix);
  }
  
  isSphereVisible(sphere: THREE.Sphere): boolean {
    if (!this.frustum) return true;
    return this.frustum.intersectsSphere(sphere);
  }
  
  isBoxVisible(box: THREE.Box3): boolean {
    if (!this.frustum) return true;
    return this.frustum.intersectsBox(box);
  }
  
  isCoordinateVisible(coord: Coordinate, radius: number = 1): boolean {
    if (!this.frustum) return true;
    
    // Convert geographic coordinate to world space
    const latRad = toRadians(coord.lat);
    const lngRad = toRadians(coord.lng);
    
    const x = Math.cos(latRad) * Math.cos(lngRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.sin(lngRad);
    
    const sphere = new THREE.Sphere(new THREE.Vector3(x, y, z), radius);
    return this.frustum.intersectsSphere(sphere);
  }
  
  isPointVisible(point: THREE.Vector3): boolean {
    if (!this.frustum) return true;
    return this.frustum.containsPoint(point);
  }
  
  cull(spheres: THREE.Sphere[]): THREE.Sphere[] {
    if (!this.frustum) return spheres;
    return spheres.filter(sphere => this.frustum!.intersectsSphere(sphere));
  }
  
  cullBoxes(boxes: THREE.Box3[]): THREE.Box3[] {
    if (!this.frustum) return boxes;
    return boxes.filter(box => this.frustum!.intersectsBox(box));
  }
  
  cullCoordinates(coords: Coordinate[], radius: number = 1): Coordinate[] {
    if (!this.frustum) return coords;
    return coords.filter(coord => this.isCoordinateVisible(coord, radius));
  }
}
