import { Coordinate } from './SpatialMath';

export interface Bounds {
  min: Coordinate;
  max: Coordinate;
}

export interface SpatialIndexItem<T = any> {
  id: string;
  bounds: Bounds;
  data?: T;
}

export class SpatialIndex<T = any> {
  private items: Map<string, SpatialIndexItem<T>> = new Map();
  private quadTree: QuadTreeNode<T> | undefined;
  
  constructor() {
    this.quadTree = new QuadTreeNode<T>({
      min: { lng: -180, lat: -90 },
      max: { lng: 180, lat: 90 }
    }, 0, 4);
  }
  
  insert(item: SpatialIndexItem<T>): void {
    this.items.set(item.id, item);
    this.quadTree?.insert(item);
  }
  
  remove(id: string): void {
    const item = this.items.get(id);
    if (item) {
      this.items.delete(id);
      this.quadTree?.remove(id);
    }
  }
  
  update(id: string, newBounds: Bounds): void {
    const item = this.items.get(id);
    if (item) {
      item.bounds = newBounds;
      this.quadTree?.remove(id);
      this.quadTree?.insert(item);
    }
  }
  
  queryPoint(point: Coordinate): SpatialIndexItem<T>[] {
    if (!this.quadTree) return [];
    return this.quadTree.queryPoint(point);
  }
  
  queryBounds(bounds: Bounds): SpatialIndexItem<T>[] {
    if (!this.quadTree) return [];
    return this.quadTree.queryBounds(bounds);
  }
  
  size(): number {
    return this.items.size;
  }
  
  clear(): void {
    this.items.clear();
    this.quadTree = new QuadTreeNode<T>({
      min: { lng: -180, lat: -90 },
      max: { lng: 180, lat: 90 }
    }, 0, 4);
  }
}

class QuadTreeNode<T> {
  bounds: Bounds;
  items: SpatialIndexItem<T>[] = [];
  children: QuadTreeNode<T>[] = [];
  level: number;
  maxLevel: number;
  
  constructor(bounds: Bounds, level: number, maxLevel: number) {
    this.bounds = bounds;
    this.level = level;
    this.maxLevel = maxLevel;
  }
  
  insert(item: SpatialIndexItem<T>): boolean {
    if (!this.intersects(this.bounds, item.bounds)) {
      return false;
    }
    
    if (this.level < this.maxLevel && this.children.length > 0) {
      for (const child of this.children) {
        if (child.insert(item)) {
          return true;
        }
      }
    }
    
    this.items.push(item);
    return true;
  }
  
  remove(id: string): boolean {
    const index = this.items.findIndex(item => item.id === id);
    if (index > -1) {
      this.items.splice(index, 1);
      return true;
    }
    
    for (const child of this.children) {
      if (child.remove(id)) {
        return true;
      }
    }
    
    return false;
  }
  
  queryPoint(point: Coordinate): SpatialIndexItem<T>[] {
    const results: SpatialIndexItem<T>[] = [];
    
    if (!this.containsPoint(this.bounds, point)) {
      return results;
    }
    
    // Add items at this level
    for (const item of this.items) {
      if (this.containsPoint(item.bounds, point)) {
        results.push(item);
      }
    }
    
    // Query children
    for (const child of this.children) {
      results.push(...child.queryPoint(point));
    }
    
    return results;
  }
  
  queryBounds(bounds: Bounds): SpatialIndexItem<T>[] {
    const results: SpatialIndexItem<T>[] = [];
    
    if (!this.intersects(this.bounds, bounds)) {
      return results;
    }
    
    // Add items at this level
    for (const item of this.items) {
      if (this.intersects(item.bounds, bounds)) {
        results.push(item);
      }
    }
    
    // Query children
    for (const child of this.children) {
      results.push(...child.queryBounds(bounds));
    }
    
    return results;
  }
  
  private intersects(a: Bounds, b: Bounds): boolean {
    return a.min.lng <= b.max.lng &&
           a.max.lng >= b.min.lng &&
           a.min.lat <= b.max.lat &&
           a.max.lat >= b.min.lat;
  }
  
  private containsPoint(bounds: Bounds, point: Coordinate): boolean {
    return point.lng >= bounds.min.lng &&
           point.lng <= bounds.max.lng &&
           point.lat >= bounds.min.lat &&
           point.lat <= bounds.max.lat;
  }
  
  subdivide(): void {
    if (this.level >= this.maxLevel) return;
    
    const midLng = (this.bounds.min.lng + this.bounds.max.lng) / 2;
    const midLat = (this.bounds.min.lat + this.bounds.max.lat) / 2;
    
    this.children = [
      new QuadTreeNode<T>({
        min: { lng: this.bounds.min.lng, lat: midLat },
        max: { lng: midLng, lat: this.bounds.max.lat }
      }, this.level + 1, this.maxLevel),
      
      new QuadTreeNode<T>({
        min: { lng: midLng, lat: midLat },
        max: { lng: this.bounds.max.lng, lat: this.bounds.max.lat }
      }, this.level + 1, this.maxLevel),
      
      new QuadTreeNode<T>({
        min: { lng: this.bounds.min.lng, lat: this.bounds.min.lat },
        max: { lng: midLng, lat: midLat }
      }, this.level + 1, this.maxLevel),
      
      new QuadTreeNode<T>({
        min: { lng: midLng, lat: this.bounds.min.lat },
        max: { lng: this.bounds.max.lng, lat: midLat }
      }, this.level + 1, this.maxLevel)
    ];
  }
}
