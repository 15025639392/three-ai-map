import * as THREE from 'three';
import { Layer } from './Layer';
import { Coordinate, toRadians } from '../spatial/SpatialMath';

export interface Marker {
  id: string;
  position: Coordinate;
  color: number;
  size: number;
}

export interface MarkerOptions {
  position: Coordinate;
  color?: number;
  size?: number;
}

export class InstancedMarkerLayer extends Layer {
  private markers: Map<string, Marker> = new Map();
  private nextId = 0;
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.Material;
  private instancedMesh?: THREE.InstancedMesh;
  
  constructor(id?: string) {
    super(id || `instanced-marker-${Date.now()}-${Math.random()}`);
  }
  
  addMarker(options: MarkerOptions): string {
    const id = `marker-${this.nextId++}`;
    const marker: Marker = {
      id,
      position: options.position,
      color: options.color ?? 0xffffff,
      size: options.size ?? 1
    };
    
    this.markers.set(id, marker);
    return id;
  }
  
  removeMarker(id: string): void {
    this.markers.delete(id);
  }
  
  updateMarker(id: string, updates: Partial<Omit<Marker, 'id' | 'position'>>): void {
    const marker = this.markers.get(id);
    if (marker) {
      Object.assign(marker, updates);
    }
  }
  
  getMarker(id: string): Marker | undefined {
    return this.markers.get(id);
  }
  
  getMarkerCount(): number {
    return this.markers.size;
  }
  
  clear(): void {
    this.markers.clear();
  }
  
  createInstancedMesh(): THREE.InstancedMesh | undefined {
    if (this.markers.size === 0) {
      return undefined;
    }
    
    // Create sphere geometry for markers
    this.geometry = new THREE.SphereGeometry(1, 16, 16);
    
    // Create material with vertex colors
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true
    });
    
    // Create instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.markers.size
    );
    
    // Update instance matrices and colors
    this.updateInstances();
    
    return this.instancedMesh;
  }
  
  updateInstances(): void {
    if (!this.instancedMesh) return;
    
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let index = 0;
    
    for (const marker of this.markers.values()) {
      // Convert geographic coordinates to world space
      const latRad = toRadians(marker.position.lat);
      const lngRad = toRadians(marker.position.lng);
      
      const x = Math.cos(latRad) * Math.cos(lngRad);
      const y = Math.sin(latRad);
      const z = Math.cos(latRad) * Math.sin(lngRad);
      
      // Position marker on sphere surface
      dummy.position.set(x, y, z);
      dummy.scale.set(marker.size, marker.size, marker.size);
      dummy.updateMatrix();
      
      this.instancedMesh.setMatrixAt(index, dummy.matrix);
      
      // Set marker color
      color.setHex(marker.color);
      this.instancedMesh.setColorAt(index, color);
      
      index++;
    }
    
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }
  
  dispose(): void {
    this.markers.clear();
    
    if (this.instancedMesh) {
      this.instancedMesh.dispose();
      this.instancedMesh = undefined;
    }
    
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = undefined;
    }
    
    if (this.material) {
      this.material.dispose();
      this.material = undefined;
    }
  }
}
