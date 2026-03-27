import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import { Layer, LayerContext, PickResult, PolygonDefinition, PolygonPickResult } from "./Layer";

export class PolygonLayer extends Layer {
  private readonly group = new Group();
  private readonly polygons = new Map<string, PolygonDefinition>();
  private context: LayerContext | null = null;

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);

    for (const polygon of this.polygons.values()) {
      this.group.add(this.createMesh(polygon, context));
    }
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);

    for (const child of this.group.children) {
      const mesh = child as Mesh<BufferGeometry, MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    this.group.clear();
    this.context = null;
  }

  addPolygon(polygon: PolygonDefinition): void {
    this.polygons.set(polygon.id, polygon);

    if (this.context) {
      this.group.add(this.createMesh(polygon, this.context));
    }
  }

  pick(raycaster: Raycaster): PickResult | null {
    const intersections = raycaster.intersectObjects(this.group.children, false);
    const hit = intersections[0];

    if (!hit) {
      return null;
    }

    return {
      type: "polygon",
      layerId: this.id,
      point: {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z
      },
      polygon: hit.object.userData.polygon as PolygonDefinition
    } satisfies PolygonPickResult;
  }

  private createMesh(polygon: PolygonDefinition, context: LayerContext) {
    const points = polygon.coordinates.map((coordinate) => {
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
    const centroid = points
      .reduce((accumulator, point) => accumulator.add(point), new Vector3())
      .multiplyScalar(1 / points.length)
      .normalize()
      .multiplyScalar(context.radius + (polygon.coordinates[0]?.altitude ?? 0));
    const positions: number[] = [];

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];

      positions.push(
        centroid.x,
        centroid.y,
        centroid.z,
        current.x,
        current.y,
        current.z,
        next.x,
        next.y,
        next.z
      );
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: polygon.fillColor ?? "#36d695",
        transparent: true,
        opacity: polygon.opacity ?? 0.55,
        depthWrite: false
      })
    );

    mesh.userData.polygon = polygon;
    return mesh;
  }
}
