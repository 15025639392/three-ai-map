import { Layer } from './Layer';
import { Coordinate } from '../spatial/SpatialMath';
import { SpatialIndex, SpatialIndexItem } from '../spatial/SpatialIndex';

export interface ClusterItem {
  id: string;
  position: Coordinate;
  data?: any;
}

export interface Cluster {
  id: string;
  position: Coordinate;
  size: number;
  items: ClusterItem[];
}

export interface ClusterLayerOptions {
  clusterRadius?: number;
  minClusterSize?: number;
  maxZoom?: number;
}

export interface ClusterOptions {
  zoom?: number;
}

export class ClusterLayer extends Layer {
  private items: Map<string, ClusterItem> = new Map();
  private spatialIndex: SpatialIndex<ClusterItem> = new SpatialIndex();
  private clusterRadius: number;
  private minClusterSize: number;
  private maxZoom: number;
  private nextId = 0;
  
  constructor(options: ClusterLayerOptions = {}) {
    super(`cluster-${Date.now()}-${Math.random()}`);
    
    this.clusterRadius = options.clusterRadius ?? 0.01;
    this.minClusterSize = options.minClusterSize ?? 2;
    this.maxZoom = options.maxZoom ?? 18;
  }
  
  addItem(item: ClusterItem): void {
    this.items.set(item.id, item);
    
    // Add to spatial index
    const bounds = this.createBounds(item.position, this.clusterRadius);
    this.spatialIndex.insert({
      id: item.id,
      bounds,
      data: item
    });
  }
  
  removeItem(id: string): void {
    this.items.delete(id);
    this.spatialIndex.remove(id);
  }
  
  getItemCount(): number {
    return this.items.size;
  }
  
  getClusters(options: ClusterOptions = {}): Cluster[] {
    const zoom = options.zoom ?? 10;
    const clusters: Cluster[] = [];
    const processed = new Set<string>();
    
    // Adjust cluster radius based on zoom
    const adjustedRadius = this.clusterRadius / Math.pow(2, Math.max(0, zoom - 10));
    
    for (const [id, item] of this.items) {
      if (processed.has(id)) continue;
      
      // Find nearby items
      const nearbyBounds = this.createBounds(item.position, adjustedRadius);
      const nearbyItems = this.spatialIndex.queryBounds(nearbyBounds);
      
      if (nearbyItems.length >= this.minClusterSize) {
        // Create cluster
        const clusterItems: ClusterItem[] = [];
        let sumLng = 0;
        let sumLat = 0;
        
        for (const spatialItem of nearbyItems) {
          if (!processed.has(spatialItem.id)) {
            processed.add(spatialItem.id);
            clusterItems.push(spatialItem.data!);
            sumLng += spatialItem.data!.position.lng;
            sumLat += spatialItem.data!.position.lat;
          }
        }
        
        const cluster: Cluster = {
          id: `cluster-${this.nextId++}`,
          position: {
            lng: sumLng / clusterItems.length,
            lat: sumLat / clusterItems.length
          },
          size: clusterItems.length,
          items: clusterItems
        };
        
        clusters.push(cluster);
      } else {
        // Individual item
        clusters.push({
          id: item.id,
          position: item.position,
          size: 1,
          items: [item]
        });
        processed.add(id);
      }
    }
    
    return clusters;
  }
  
  clear(): void {
    this.items.clear();
    this.spatialIndex.clear();
  }
  
  private createBounds(center: Coordinate, radius: number): {
    min: Coordinate;
    max: Coordinate;
  } {
    return {
      min: {
        lng: center.lng - radius,
        lat: center.lat - radius
      },
      max: {
        lng: center.lng + radius,
        lat: center.lat + radius
      }
    };
  }
}
