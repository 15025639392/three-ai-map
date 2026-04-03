import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  Vector3
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import {
  Layer,
  LayerContext,
  LayerErrorCategory,
  LayerErrorSeverity,
  LayerRecoveryOverrides,
  PickResult,
  VectorFeaturePickResult
} from "./Layer";

export interface VectorTileFeature {
  type: "point" | "line" | "polygon";
  layer: string;
  geometry: number[][][];
  properties?: Record<string, unknown>;
}

export interface VectorTileLayerOptions {
  url: string;
  layerFilter?: string[];
  style?: Record<string, unknown>;
  minZoom?: number;
  maxZoom?: number;
  parseRetryAttempts?: number;
  parseRetryDelayMs?: number;
  parseFallbackToEmpty?: boolean;
}

interface VectorPickCandidate {
  feature: VectorTileFeature;
  point: Vector3;
  distance: number;
  zIndex: number;
}

type ParsedGeometry =
  | {
      type: "point";
      geometry: number[][][];
    }
  | {
      type: "line";
      geometry: number[][][];
    }
  | {
      type: "polygon";
      geometry: number[][][];
    };

type GeoJsonCoordinates = number[] | number[][] | number[][][] | number[][][][];

class VectorTileParseError extends Error {
  readonly tileKey: string;
  readonly coordinate: { z: number; x: number; y: number };
  readonly cause: unknown;
  readonly attempts: number;
  readonly fallbackUsed: boolean;

  constructor(
    tileKey: string,
    coordinate: { z: number; x: number; y: number },
    cause: unknown,
    attempts: number,
    fallbackUsed: boolean
  ) {
    super(`Vector tile parse failed for ${tileKey}`);
    this.name = "VectorTileParseError";
    this.tileKey = tileKey;
    this.coordinate = coordinate;
    this.cause = cause;
    this.attempts = attempts;
    this.fallbackUsed = fallbackUsed;
  }
}

interface VectorParseRecoveryConfig {
  attempts: number;
  delayMs: number;
  fallbackToEmpty: boolean;
}

function normalizeGeometry(
  geometryType: string,
  coordinates: GeoJsonCoordinates
): ParsedGeometry | null {
  switch (geometryType) {
    case "Point":
      return {
        type: "point",
        geometry: [[coordinates as number[]]]
      };
    case "MultiPoint":
      return {
        type: "point",
        geometry: (coordinates as number[][]).map((coordinate) => [coordinate])
      };
    case "LineString":
      return {
        type: "line",
        geometry: [coordinates as number[][]]
      };
    case "MultiLineString":
      return {
        type: "line",
        geometry: coordinates as number[][][]
      };
    case "Polygon":
      return {
        type: "polygon",
        geometry: coordinates as number[][][]
      };
    case "MultiPolygon":
      return {
        type: "polygon",
        geometry: (coordinates as number[][][][]).flat()
      };
    default:
      return null;
  }
}

function getStyleValue<T>(style: Record<string, unknown>, key: string, fallback: T): T {
  return (style[key] as T | undefined) ?? fallback;
}

function toVector3(lng: number, lat: number, altitude: number, radius: number): Vector3 {
  const point = cartographicToCartesian(
    {
      lng,
      lat,
      height: altitude
    },
    radius
  );

  return new Vector3(point.x, point.y, point.z);
}

function disposeObject(object: Object3D): void {
  const mesh = object as Mesh<BufferGeometry, Material> | Line<BufferGeometry, Material>;

  if ("geometry" in mesh && mesh.geometry) {
    mesh.geometry.dispose();
  }

  if ("material" in mesh && mesh.material) {
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) {
        material.dispose();
      }
    } else {
      mesh.material.dispose();
    }
  }

  for (const child of object.children) {
    disposeObject(child);
  }
}

export class VectorTileLayer extends Layer {
  private readonly url: string;
  private readonly layerFilter: Set<string> | null;
  private readonly style: Record<string, unknown>;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly parseRetryAttempts: number;
  private readonly parseRetryDelayMs: number;
  private readonly parseFallbackToEmpty: boolean;
  private readonly group = new Group();
  private readonly tileFeatures = new Map<string, VectorTileFeature[]>();
  private context: LayerContext | null = null;

  constructor(options: VectorTileLayerOptions) {
    super(`vector-tile-${Date.now()}-${Math.random()}`);

    this.url = options.url;
    this.layerFilter = options.layerFilter ? new Set(options.layerFilter) : null;
    this.style = options.style ?? {};
    this.minZoom = options.minZoom ?? 0;
    this.maxZoom = options.maxZoom ?? 18;
    this.parseRetryAttempts = Math.max(0, Math.floor(options.parseRetryAttempts ?? 0));
    this.parseRetryDelayMs = Math.max(0, Math.floor(options.parseRetryDelayMs ?? 0));
    this.parseFallbackToEmpty = options.parseFallbackToEmpty ?? false;
    this.group.name = this.id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);
    this.rebuildObjects();
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    this.clearGroup();
    this.context = null;
  }

  dispose(): void {
    this.clearGroup();
    this.tileFeatures.clear();
  }

  async parseTile(tileData: Uint8Array, x: number, y: number, z: number): Promise<VectorTileFeature[]> {
    if (tileData.length === 0) {
      return [];
    }

    const tile = new VectorTile(new Pbf(tileData));
    const features: VectorTileFeature[] = [];

    for (const [layerName, vectorTileLayer] of Object.entries(tile.layers)) {
      if (this.layerFilter && !this.layerFilter.has(layerName)) {
        continue;
      }

      for (let featureIndex = 0; featureIndex < vectorTileLayer.length; featureIndex += 1) {
        const geoJsonFeature = vectorTileLayer.feature(featureIndex).toGeoJSON(x, y, z);
        const geometry = geoJsonFeature.geometry;

        if (!geometry || geometry.type === "GeometryCollection") {
          continue;
        }

        const normalizedGeometry = normalizeGeometry(
          geometry.type,
          geometry.coordinates as GeoJsonCoordinates
        );

        if (!normalizedGeometry) {
          continue;
        }

        features.push({
          type: normalizedGeometry.type,
          layer: layerName,
          geometry: normalizedGeometry.geometry,
          properties: geoJsonFeature.properties ?? {}
        });
      }
    }

    return features;
  }

  async setTileData(tileData: Uint8Array, x: number, y: number, z: number): Promise<VectorTileFeature[]> {
    const tileKey = `${z}/${x}/${y}`;
    let parsedFeatures: VectorTileFeature[];

    try {
      parsedFeatures = await this.parseTileWithRecovery(tileData, x, y, z, tileKey);
    } catch (error) {
      this.reportVectorError(tileKey, { z, x, y }, error);

      if (error instanceof VectorTileParseError && error.fallbackUsed) {
        this.tileFeatures.set(tileKey, []);
        this.rebuildObjects();
        return [];
      }

      throw this.unwrapReportedError(error);
    }

    const styledFeatures = parsedFeatures.map((feature) => this.applyStyle(feature));

    this.tileFeatures.set(tileKey, styledFeatures);
    this.rebuildObjects();
    return styledFeatures;
  }

  setFeatures(features: VectorTileFeature[], tileKey = "manual"): void {
    this.tileFeatures.set(
      tileKey,
      features.map((feature) => this.applyStyle(feature))
    );
    this.rebuildObjects();
  }

  clearTiles(): void {
    this.tileFeatures.clear();
    this.rebuildObjects();
  }

  pick(raycaster: Raycaster): PickResult | null {
    const previousThreshold = raycaster.params.Line?.threshold ?? 1;
    raycaster.params.Line = {
      ...(raycaster.params.Line ?? {}),
      threshold: this.context ? this.context.radius * 0.08 : previousThreshold
    };
    const intersections = raycaster.intersectObject(this.group, true);
    raycaster.params.Line.threshold = previousThreshold;
    const hit = this.pickBestIntersection(intersections);

    if (!hit) {
      return null;
    }

    return {
      type: "vector-feature",
      layerId: this.id,
      point: {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z
      },
      feature: hit.feature
    } satisfies VectorFeaturePickResult;
  }

  applyStyle(feature: VectorTileFeature): VectorTileFeature {
    const layerStyle = (this.style[feature.layer] as Record<string, unknown> | undefined) ?? {};

    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: layerStyle
      }
    };
  }

  getTileUrl(x: number, y: number, z: number): string {
    return this.url
      .replace("{z}", z.toString())
      .replace("{x}", x.toString())
      .replace("{y}", y.toString());
  }

  shouldRender(z: number): boolean {
    return z >= this.minZoom && z <= this.maxZoom;
  }

  private rebuildObjects(): void {
    if (!this.context) {
      return;
    }

    this.clearGroup();

    for (const feature of this.getAllFeatures()) {
      const object = this.createFeatureObject(feature, this.context.radius);

      if (object) {
        this.group.add(object);
      }
    }
  }

  private getAllFeatures(): VectorTileFeature[] {
    return [...this.tileFeatures.values()].flat();
  }

  private clearGroup(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeObject(child);
    }
  }

  private createFeatureObject(feature: VectorTileFeature, radius: number): Object3D | null {
    const style = (feature.properties?.style as Record<string, unknown> | undefined) ?? {};
    const altitude = getStyleValue(style, "altitude", radius * 0.01);
    const zIndex = this.resolveFeatureZIndex(feature);
    const wrapper = new Group();
    wrapper.name = `${feature.layer}:${feature.type}`;
    wrapper.userData.vectorFeature = feature;
    wrapper.renderOrder = zIndex;

    if (feature.type === "point") {
      const pointColor = getStyleValue<string | number>(style, "pointColor", "#ffcc66");
      const pointSize = getStyleValue(style, "pointSize", radius * 0.02);

      for (const pointGroup of feature.geometry) {
        const [lng, lat] = pointGroup[0] ?? [];

        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          continue;
        }

        const position = toVector3(lng, lat, altitude, radius);
        const point = new Mesh(
          new SphereGeometry(pointSize, 12, 12),
          new MeshBasicMaterial({ color: pointColor })
        );

        point.position.copy(position);
        point.userData.vectorFeature = feature;
        point.renderOrder = zIndex;
        wrapper.add(point);
      }

      return wrapper.children.length > 0 ? wrapper : null;
    }

    if (feature.type === "line") {
      const strokeColor = getStyleValue<string | number>(style, "strokeColor", "#f8f9fb");

      for (const lineCoordinates of feature.geometry) {
        const points = lineCoordinates
          .map(([lng, lat]) => toVector3(lng, lat, altitude, radius));

        if (points.length < 2) {
          continue;
        }

        const line = new Line(
          new BufferGeometry().setFromPoints(points),
          new LineBasicMaterial({ color: strokeColor })
        );

        line.userData.vectorFeature = feature;
        line.renderOrder = zIndex;
        wrapper.add(line);
      }

      return wrapper.children.length > 0 ? wrapper : null;
    }

    const fillColor = getStyleValue<string | number>(style, "fillColor", "#36d695");
    const opacity = getStyleValue(style, "opacity", 0.55);

    for (const ring of feature.geometry) {
      if (ring.length < 3) {
        continue;
      }

      const points = ring.map(([lng, lat]) => toVector3(lng, lat, altitude, radius));
      const centroid = points
        .reduce((accumulator, point) => accumulator.add(point), new Vector3())
        .multiplyScalar(1 / points.length)
        .normalize()
        .multiplyScalar(radius + altitude);
      const positions: number[] = [];

      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];

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
          color: fillColor,
          transparent: true,
          opacity,
          depthWrite: false,
          side: DoubleSide
        })
      );

      mesh.userData.vectorFeature = feature;
      mesh.renderOrder = zIndex;
      wrapper.add(mesh);
    }

    return wrapper.children.length > 0 ? wrapper : null;
  }

  private extractVectorFeature(object: Object3D): VectorTileFeature | null {
    let current: Object3D | null = object;

    while (current) {
      const feature = current.userData.vectorFeature as VectorTileFeature | undefined;

      if (feature) {
        return feature;
      }

      if (current === this.group) {
        break;
      }

      current = current.parent;
    }

    return null;
  }

  private pickBestIntersection(
    intersections: Array<{ object: Object3D; point: Vector3; distance: number }>
  ): VectorPickCandidate | null {
    let bestCandidate: VectorPickCandidate | null = null;

    for (const intersection of intersections) {
      const feature = this.extractVectorFeature(intersection.object);

      if (!feature) {
        continue;
      }

      const candidate: VectorPickCandidate = {
        feature,
        point: intersection.point,
        distance: intersection.distance,
        zIndex: this.resolveFeatureZIndex(feature)
      };

      if (!bestCandidate) {
        bestCandidate = candidate;
        continue;
      }

      if (candidate.zIndex > bestCandidate.zIndex) {
        bestCandidate = candidate;
        continue;
      }

      if (candidate.zIndex === bestCandidate.zIndex && candidate.distance < bestCandidate.distance) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  private resolveFeatureZIndex(feature: VectorTileFeature): number {
    const style = feature.properties?.style as Record<string, unknown> | undefined;
    const zIndex = style?.zIndex;
    const parsedZIndex =
      typeof zIndex === "number" ? zIndex : typeof zIndex === "string" ? Number(zIndex) : 0;

    if (!Number.isFinite(parsedZIndex)) {
      return 0;
    }

    return parsedZIndex;
  }

  private async parseTileWithRecovery(
    tileData: Uint8Array,
    x: number,
    y: number,
    z: number,
    tileKey: string
  ): Promise<VectorTileFeature[]> {
    const recoveryConfig = this.resolveParseRecoveryConfig();
    const maxAttempts = recoveryConfig.attempts + 1;
    const coordinate = { z, x, y };
    let lastError: unknown = new Error(`Vector tile parse failed for ${tileKey}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.parseTile(tileData, x, y, z);
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          await this.waitRetryDelay(recoveryConfig.delayMs);
          continue;
        }
      }
    }

    throw new VectorTileParseError(
      tileKey,
      coordinate,
      lastError,
      maxAttempts,
      recoveryConfig.fallbackToEmpty
    );
  }

  private resolveParseRecoveryConfig(): VectorParseRecoveryConfig {
    const overrides = this.context?.resolveRecovery?.({
      layerId: this.id,
      stage: "tile-parse",
      category: "data",
      severity: "warn"
    });

    return {
      attempts: this.normalizeParseRetryAttempts(overrides),
      delayMs: this.normalizeParseRetryDelay(overrides),
      fallbackToEmpty:
        overrides?.vectorParseFallbackToEmpty !== undefined
          ? overrides.vectorParseFallbackToEmpty
          : this.parseFallbackToEmpty
    };
  }

  private normalizeParseRetryAttempts(overrides?: LayerRecoveryOverrides): number {
    return Math.max(
      0,
      Math.floor(overrides?.vectorParseRetryAttempts ?? this.parseRetryAttempts)
    );
  }

  private normalizeParseRetryDelay(overrides?: LayerRecoveryOverrides): number {
    return Math.max(0, Math.floor(overrides?.vectorParseRetryDelayMs ?? this.parseRetryDelayMs));
  }

  private async waitRetryDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private reportVectorError(
    tileKey: string,
    coordinate: { z: number; x: number; y: number },
    error: unknown
  ): void {
    const payload = this.createLayerErrorPayload(tileKey, coordinate, error);
    this.emitLayerError(this.context, payload);
  }

  private createLayerErrorPayload(
    tileKey: string,
    coordinate: { z: number; x: number; y: number },
    error: unknown
  ): {
    stage: string;
    category: LayerErrorCategory;
    severity: LayerErrorSeverity;
    error: unknown;
    recoverable: boolean;
    tileKey: string;
    metadata: Record<string, unknown>;
  } {
    if (error instanceof VectorTileParseError) {
      return {
        stage: "tile-parse",
        category: "data",
        severity: "warn",
        error: error.cause,
        recoverable: true,
        tileKey: error.tileKey,
        metadata: {
          coordinate: error.coordinate,
          attempts: error.attempts,
          fallbackUsed: error.fallbackUsed
        }
      };
    }

    return {
      stage: "tile-set",
      category: "unknown",
      severity: "error",
      error,
      recoverable: false,
      tileKey,
      metadata: {
        coordinate
      }
    };
  }

  private unwrapReportedError(error: unknown): unknown {
    if (error instanceof VectorTileParseError) {
      return error.cause;
    }

    return error;
  }
}
