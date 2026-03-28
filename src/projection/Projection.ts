import * as THREE from 'three';
import { Coordinate, toRadians, clampLatitude } from '../spatial/SpatialMath';

export enum ProjectionType {
  WebMercator = 'web-mercator',
  Equirectangular = 'equirectangular',
  Geographic = 'geographic'
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface TileWorldPosition {
  x: number;
  y: number;
  scale: number;
}

export abstract class Projection {
  abstract type: ProjectionType;
  
  abstract project(coord: Coordinate): WorldPosition;
  abstract unproject(world: WorldPosition): Coordinate;
  
  abstract getTileWorldPosition(tileX: number, tileY: number, zoom: number): TileWorldPosition;
}

export class WebMercatorProjection extends Projection {
  static type = ProjectionType.WebMercator;
  type = WebMercatorProjection.type;
  
  private readonly maxLatitude = 85.05112878;
  
  project(coord: Coordinate): WorldPosition {
    const lat = clampLatitude(coord.lat, -this.maxLatitude, this.maxLatitude);
    
    const x = toRadians(coord.lng) / (2 * Math.PI) + 0.5;
    const y = 0.5 - Math.log(Math.tan(toRadians(lat) / 2 + Math.PI / 4)) / (2 * Math.PI);
    
    return {
      x: x - 0.5,
      y: y - 0.5,
      z: 1
    };
  }
  
  unproject(world: WorldPosition): Coordinate {
    const x = world.x + 0.5;
    const y = world.y + 0.5;
    
    const lng = (x - 0.5) * 360;
    const latRad = 2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2;
    const lat = latRad * 180 / Math.PI;
    
    return {
      lng,
      lat
    };
  }
  
  getTileWorldPosition(tileX: number, tileY: number, zoom: number): TileWorldPosition {
    const tilesAtZoom = 2 ** zoom;
    const scale = 1 / tilesAtZoom;
    
    return {
      x: tileX * scale - 0.5,
      y: tileY * scale - 0.5,
      scale
    };
  }
}

export class EquirectangularProjection extends Projection {
  static type = ProjectionType.Equirectangular;
  type = EquirectangularProjection.type;
  
  project(coord: Coordinate): WorldPosition {
    const x = coord.lng / 360;
    const y = coord.lat / 180;
    
    return {
      x: x - 0.5,
      y: y - 0.5,
      z: 1
    };
  }
  
  unproject(world: WorldPosition): Coordinate {
    const x = world.x + 0.5;
    const y = world.y + 0.5;
    
    const lng = x * 360;
    const lat = y * 180;
    
    return {
      lng,
      lat
    };
  }
  
  getTileWorldPosition(tileX: number, tileY: number, zoom: number): TileWorldPosition {
    const tilesAtZoom = 2 ** zoom;
    const scale = 1 / tilesAtZoom;
    
    return {
      x: tileX * scale - 0.5,
      y: tileY * scale - 0.5,
      scale
    };
  }
}

export class GeographicProjection extends Projection {
  static type = ProjectionType.Geographic;
  type = GeographicProjection.type;
  
  project(coord: Coordinate): WorldPosition {
    const latRad = toRadians(coord.lat);
    const lngRad = toRadians(coord.lng);
    
    const x = Math.cos(latRad) * Math.sin(lngRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.cos(lngRad);
    
    return { x, y, z };
  }
  
  unproject(world: WorldPosition): Coordinate {
    const { x, y, z } = world;
    
    const latRad = Math.asin(y);
    const lngRad = Math.atan2(x, z);
    
    const lat = latRad * 180 / Math.PI;
    const lng = lngRad * 180 / Math.PI;
    
    return {
      lng,
      lat
    };
  }
  
  getTileWorldPosition(tileX: number, tileY: number, zoom: number): TileWorldPosition {
    const tilesAtZoom = 2 ** zoom;
    const tileLng = (tileX / tilesAtZoom) * 360 - 180;
    const tileLat = 90 - (tileY / tilesAtZoom) * 180;
    
    const center = this.project({ lng: tileLng, lat: tileLat });
    
    // Approximate scale based on zoom level
    const scale = 1 / tilesAtZoom;
    
    return {
      x: center.x,
      y: center.y,
      scale
    };
  }
}
