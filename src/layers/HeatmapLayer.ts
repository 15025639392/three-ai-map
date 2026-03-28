import { Layer } from './Layer';
import { Coordinate } from '../spatial/SpatialMath';

export interface HeatmapPoint {
  id?: string;
  position: Coordinate;
  intensity: number;
}

export interface HeatmapLayerOptions {
  radius?: number;
  maxIntensity?: number;
  blurRadius?: number;
  width?: number;
  height?: number;
}

export interface HeatmapTexture {
  width: number;
  height: number;
  data: Uint8Array;
}

export class HeatmapLayer extends Layer {
  private points: HeatmapPoint[] = [];
  private nextId = 0;
  private radius: number;
  private maxIntensity: number;
  private blurRadius: number;
  private width: number;
  private height: number;
  
  constructor(options: HeatmapLayerOptions = {}) {
    super(`heatmap-${Date.now()}-${Math.random()}`);
    
    this.radius = options.radius ?? 0.01;
    this.maxIntensity = options.maxIntensity ?? 10;
    this.blurRadius = options.blurRadius ?? 2;
    this.width = options.width ?? 512;
    this.height = options.height ?? 512;
  }
  
  addPoint(point: HeatmapPoint): string {
    const id = point.id ?? `point-${this.nextId++}`;
    this.points.push({
      ...point,
      id
    });
    return id;
  }
  
  removePoint(id: string): void {
    const index = this.points.findIndex(p => p.id === id);
    if (index > -1) {
      this.points.splice(index, 1);
    }
  }
  
  getPointCount(): number {
    return this.points.length;
  }
  
  clear(): void {
    this.points = [];
  }
  
  getIntensityAt(position: Coordinate): number {
    let totalIntensity = 0;
    
    for (const point of this.points) {
      const distance = this.calculateDistance(position, point.position);
      
      if (distance < this.radius) {
        // Use gaussian kernel for smooth falloff
        const intensity = point.intensity * Math.exp(-Math.pow(distance, 2) / (2 * Math.pow(this.radius / 2, 2)));
        totalIntensity += intensity;
      }
    }
    
    return Math.min(totalIntensity, this.maxIntensity);
  }
  
  generateTexture(): HeatmapTexture {
    const data = new Uint8Array(this.width * this.height * 4);
    
    // Initialize with transparent black
    data.fill(0);
    
    // Create intensity grid
    const intensityGrid = new Float32Array(this.width * this.height);
    
    for (let point of this.points) {
      // Convert geographic position to texture coordinates
      const tx = Math.floor(((point.position.lng + 180) / 360) * this.width);
      const ty = Math.floor(((90 - point.position.lat) / 180) * this.height);
      
      // Add intensity to nearby pixels
      const radiusPx = Math.floor(this.radius / 360 * this.width);
      
      for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          const px = tx + dx;
          const py = ty + dy;
          
          if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= radiusPx) {
              const intensity = point.intensity * Math.exp(-Math.pow(distance, 2) / (2 * Math.pow(radiusPx / 2, 2)));
              const index = py * this.width + px;
              intensityGrid[index] = Math.min(intensityGrid[index] + intensity, this.maxIntensity);
            }
          }
        }
      }
    }
    
    // Apply blur and convert to RGBA
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        let intensity = 0;
        
        // Apply blur
        for (let dy = -this.blurRadius; dy <= this.blurRadius; dy++) {
          for (let dx = -this.blurRadius; dx <= this.blurRadius; dx++) {
            const px = x + dx;
            const py = y + dy;
            
            if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
              const pIndex = py * this.width + px;
              intensity += intensityGrid[pIndex];
            }
          }
        }
        
        const kernelSize = (this.blurRadius * 2 + 1) ** 2;
        intensity = intensity / kernelSize;
        
        // Convert intensity to color (gradient from blue to green to red)
        const normalizedIntensity = Math.min(intensity / this.maxIntensity, 1);
        const rgba = this.intensityToColor(normalizedIntensity);
        
        const pixelIndex = index * 4;
        data[pixelIndex] = rgba.r;
        data[pixelIndex + 1] = rgba.g;
        data[pixelIndex + 2] = rgba.b;
        data[pixelIndex + 3] = Math.floor(normalizedIntensity * 255); // Alpha based on intensity
      }
    }
    
    return {
      width: this.width,
      height: this.height,
      data
    };
  }
  
  private calculateDistance(a: Coordinate, b: Coordinate): number {
    const dx = a.lng - b.lng;
    const dy = a.lat - b.lat;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  private intensityToColor(intensity: number): { r: number; g: number; b: number } {
    // Blue -> Green -> Red gradient
    if (intensity < 0.5) {
      // Blue to Green
      const t = intensity * 2;
      return {
        r: 0,
        g: Math.floor(t * 255),
        b: Math.floor((1 - t) * 255)
      };
    } else {
      // Green to Red
      const t = (intensity - 0.5) * 2;
      return {
        r: Math.floor(t * 255),
        g: Math.floor((1 - t) * 255),
        b: 0
      };
    }
  }
}
