import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Raycaster,
  Vector3
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import { Layer, LayerContext, PickResult, PolylineDefinition, PolylinePickResult } from "./Layer";

export class PolylineLayer extends Layer {
  private readonly group = new Group();
  private readonly polylines = new Map<string, PolylineDefinition>();
  private context: LayerContext | null = null;

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);

    for (const polyline of this.polylines.values()) {
      this.group.add(this.createLine(polyline, context));
    }
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);

    for (const child of this.group.children) {
      const line = child as Line<BufferGeometry, LineBasicMaterial>;
      line.geometry.dispose();
      line.material.dispose();
    }

    this.group.clear();
    this.context = null;
  }

  addPolyline(polyline: PolylineDefinition): void {
    this.polylines.set(polyline.id, polyline);

    if (this.context) {
      this.group.add(this.createLine(polyline, this.context));
    }
  }

  pick(raycaster: Raycaster): PickResult | null {
    if (!this.context) {
      return null;
    }

    const previousThreshold = raycaster.params.Line?.threshold ?? 1;
    raycaster.params.Line = {
      ...(raycaster.params.Line ?? {}),
      threshold: this.context.radius * 0.08
    };
    const intersections = raycaster.intersectObjects(this.group.children, false);
    raycaster.params.Line.threshold = previousThreshold;
    const hit = intersections[0];

    if (!hit) {
      return null;
    }

    return {
      type: "polyline",
      layerId: this.id,
      point: {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z
      },
      polyline: hit.object.userData.polyline as PolylineDefinition
    } satisfies PolylinePickResult;
  }

  private createLine(polyline: PolylineDefinition, context: LayerContext) {
    const points = polyline.coordinates.map((coordinate) => {
      const point = cartographicToCartesian(
        {
          lng: coordinate.lng,
          lat: coordinate.lat,
          height: coordinate.altitude
        },
        context.radius
      );
      return new Vector3(point.x, point.y, point.z);
    });
    const line = new Line(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({
        color: polyline.color ?? "#f8f9fb"
      })
    );

    line.userData.polyline = polyline;
    return line;
  }
}
