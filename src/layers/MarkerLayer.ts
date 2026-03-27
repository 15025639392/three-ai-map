import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  SphereGeometry
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import { Layer, LayerContext, MarkerDefinition, MarkerPickResult, PickResult } from "./Layer";

function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

export class MarkerLayer extends Layer {
  private readonly group = new Group();
  private readonly markers = new Map<string, MarkerDefinition>();
  private context: LayerContext | null = null;

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);

    for (const marker of this.markers.values()) {
      this.group.add(this.createMarkerMesh(marker, context));
    }
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);

    for (const child of this.group.children) {
      const mesh = child as Mesh<SphereGeometry, MeshStandardMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    this.group.clear();
    this.context = null;
  }

  addMarker(marker: MarkerDefinition): void {
    this.markers.set(marker.id, marker);

    if (this.context) {
      this.group.add(this.createMarkerMesh(marker, this.context));
    }
  }

  pick(raycaster: Raycaster): PickResult | null {
    if (!this.context) {
      return null;
    }

    let bestHit: MarkerPickResult | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const marker of this.markers.values()) {
      const markerPosition = cartographicToCartesian(
        {
          lng: marker.lng,
          lat: marker.lat,
          height: marker.altitude
        },
        this.context.radius
      );
      const size = marker.size ?? this.context.radius * 0.035;
      const offsetX = markerPosition.x - raycaster.ray.origin.x;
      const offsetY = markerPosition.y - raycaster.ray.origin.y;
      const offsetZ = markerPosition.z - raycaster.ray.origin.z;
      const distanceAlongRay = dot(
        offsetX,
        offsetY,
        offsetZ,
        raycaster.ray.direction.x,
        raycaster.ray.direction.y,
        raycaster.ray.direction.z
      );

      if (distanceAlongRay < 0) {
        continue;
      }

      const closestPoint = {
        x: raycaster.ray.origin.x + raycaster.ray.direction.x * distanceAlongRay,
        y: raycaster.ray.origin.y + raycaster.ray.direction.y * distanceAlongRay,
        z: raycaster.ray.origin.z + raycaster.ray.direction.z * distanceAlongRay
      };
      const deltaX = markerPosition.x - closestPoint.x;
      const deltaY = markerPosition.y - closestPoint.y;
      const deltaZ = markerPosition.z - closestPoint.z;
      const distanceToRay = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);

      if (distanceToRay > size * 1.5 || distanceAlongRay >= bestDistance) {
        continue;
      }

      bestDistance = distanceAlongRay;
      bestHit = {
        type: "marker",
        layerId: this.id,
        point: markerPosition,
        marker
      } satisfies MarkerPickResult;
    }

    return bestHit;
  }

  private createMarkerMesh(marker: MarkerDefinition, context: LayerContext) {
    const size = marker.size ?? context.radius * 0.035;
    const position = cartographicToCartesian(
      {
        lng: marker.lng,
        lat: marker.lat,
        height: marker.altitude
      },
      context.radius
    );
    const mesh = new Mesh(
      new SphereGeometry(size, 16, 16),
      new MeshStandardMaterial({
        color: marker.color ?? "#ffcc66",
        emissive: marker.color ?? "#ff7a18",
        emissiveIntensity: 0.35
      })
    );

    mesh.position.set(position.x, position.y, position.z);
    mesh.userData.marker = marker;
    return mesh;
  }
}
