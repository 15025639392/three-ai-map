import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
  WebGLRenderTarget
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import { RasterTileSource } from "../sources/RasterTileSource";
import { TileRequestCancelledError } from "../tiles/TileScheduler";
import { computeTargetZoom, type TileCoordinate } from "../tiles/TileViewport";
import { planSurfaceTileNodes, type SurfaceTileInteractionPhase } from "../tiles/SurfaceTilePlanner";
import type { TileSource } from "../tiles/tileLoader";
import { getSurfaceTileBounds } from "../tiles/SurfaceTileTree";
import { Layer, LayerContext } from "./Layer";
import { GpuTileDrawItem, RasterGpuComposer } from "./RasterGpuComposer";

export interface RasterLayerOptions {
  id: string;
  source: string;
  opacity?: number;
  zIndex?: number;
  imageryRetryAttempts?: number;
  imageryRetryDelayMs?: number;
  imageryFallbackColor?: string | null;
}

interface RasterTileEntry {
  promise: Promise<void>;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  loading: boolean;
  hostTileKey: string;
  hostGeometryVersion: number | null;
  requestKey: string;
  requestedImageryTileKeys: string[];
  version: number;
  composedTarget: WebGLRenderTarget | null;
  pendingDetailDraws: GpuTileDrawItem[];
  detailFlushScheduled: boolean;
}

interface SourceCropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

type RasterTileRequestRole = "fallback" | "detail";

interface RasterTileRequest {
  coordinate: TileCoordinate;
  tileKey: string;
  destinationX: number;
  destinationY: number;
  destinationSize: number;
  priority: number;
  role: RasterTileRequestRole;
  sourceCrop?: SourceCropRegion;
}

interface RasterTilePlan {
  hostTileKey: string;
  imageryZoom: number;
  textureSize: number;
  requestKey: string;
  baseRequests: RasterTileRequest[];
  detailRequests: RasterTileRequest[];
  requestedImageryTileKeys: string[];
  requiresCompositing: boolean;
}

interface LoadedRasterTile {
  request: RasterTileRequest;
  source: TileSource;
}

class StaleRasterTileError extends Error {
  constructor() {
    super("Raster tile entry is no longer current");
  }
}

class RasterTileLoadError extends Error {
  readonly tileKey: string;
  readonly coordinate: TileCoordinate;
  readonly hostTileKey: string;
  readonly attemptsUsed: number;
  readonly originalError: unknown;

  constructor(options: {
    tileKey: string;
    coordinate: TileCoordinate;
    hostTileKey: string;
    attemptsUsed: number;
    originalError: unknown;
  }) {
    const message = options.originalError instanceof Error
      ? options.originalError.message
      : `Failed to load raster tile ${options.tileKey}`;
    super(message);
    this.tileKey = options.tileKey;
    this.coordinate = options.coordinate;
    this.hostTileKey = options.hostTileKey;
    this.attemptsUsed = options.attemptsUsed;
    this.originalError = options.originalError;
  }
}

function createTexture(source: TileSource): Texture {
  const texture = new Texture(source);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function parseTileKey(key: string): TileCoordinate {
  const [z, x, y] = key.split("/").map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid tile key: ${key}`);
  }

  return { z, x, y };
}

function isTileRequestAbort(error: unknown): boolean {
  return error instanceof TileRequestCancelledError || (
    error instanceof Error && error.name === "AbortError"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createSolidColorFallback(color: string, size = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function resolveImageryRecoveryConfig(
  context: LayerContext | null,
  layerId: string,
  defaults: { attempts: number; delayMs: number; fallbackColor: string | null }
): { attempts: number; delayMs: number; fallbackColor: string | null } {
  const baseAttempts = defaults.attempts;
  const baseDelayMs = defaults.delayMs;
  const baseFallbackColor = defaults.fallbackColor;

  if (!context?.resolveRecovery) {
    return { attempts: baseAttempts, delayMs: baseDelayMs, fallbackColor: baseFallbackColor };
  }

  const overrides = context.resolveRecovery({
    layerId,
    stage: "imagery",
    category: "network",
    severity: "warn"
  });

  const attempts = Math.max(0, Math.floor(overrides?.imageryRetryAttempts ?? baseAttempts));
  const delayMs = Math.max(0, Math.floor(overrides?.imageryRetryDelayMs ?? baseDelayMs));
  const fallbackColor =
    overrides?.imageryFallbackColor !== undefined ? overrides.imageryFallbackColor : baseFallbackColor;

  return { attempts, delayMs, fallbackColor };
}

const RASTER_BASE = 1000;
const ZINDEX_STRIDE = 1000;
const MAX_COMPOSED_TEXTURE_SIZE = 4096;
const FALLBACK_PRIORITY_BOOST = 1_000_000;
const PRIORITY_BASELINE = 100_000;
const POLAR_CAP_SEGMENTS = 10;
const MAX_INTERACTING_DETAIL_REQUESTS_PER_HOST = 16;
const MAX_IDLE_DETAIL_REQUESTS_PER_HOST = 48;
const RASTER_IMAGERY_PLAN_MESH_SEGMENTS = 16;
const RASTER_ELLIPSOID_MESH_SEGMENTS = 16;

const CAP_P0 = new Vector3();
const CAP_P1 = new Vector3();
const CAP_P2 = new Vector3();
const CAP_N = new Vector3();
const CAP_C = new Vector3();

function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function sortCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return coordinates.sort((left, right) => {
    if (left.z !== right.z) {
      return left.z - right.z;
    }
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });
}

function uniqueSortedCoordinates(coordinates: TileCoordinate[]): TileCoordinate[] {
  return sortCoordinates([...new Map(
    coordinates.map((coordinate) => [tileCoordinateKey(coordinate), coordinate])
  ).values()]);
}

interface UvBounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

type PolarHemisphere = "north" | "south";

function resolveUvBounds(geometry: BufferGeometry): UvBounds {
  const uvAttribute = geometry.getAttribute("uv");

  if (!uvAttribute || uvAttribute.itemSize < 2) {
    return { minU: 0, maxU: 1, minV: 0, maxV: 1 };
  }

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < uvAttribute.count; index += 1) {
    const u = uvAttribute.getX(index);
    const v = uvAttribute.getY(index);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  if (!Number.isFinite(minU) || !Number.isFinite(maxU) || !Number.isFinite(minV) || !Number.isFinite(maxV)) {
    return { minU: 0, maxU: 1, minV: 0, maxV: 1 };
  }

  return { minU, maxU, minV, maxV };
}

function getPolarHemisphere(coordinate: TileCoordinate): PolarHemisphere | null {
  const worldTileCount = 2 ** coordinate.z;

  if (coordinate.y === 0) {
    return "north";
  }

  if (coordinate.y === worldTileCount - 1) {
    return "south";
  }

  return null;
}

function appendOrientedTriangle(
  indices: number[],
  positions: number[],
  i0: number,
  i1: number,
  i2: number
): void {
  const o0 = i0 * 3;
  const o1 = i1 * 3;
  const o2 = i2 * 3;
  CAP_P0.set(positions[o0], positions[o0 + 1], positions[o0 + 2]);
  CAP_P1.set(positions[o1], positions[o1 + 1], positions[o1 + 2]);
  CAP_P2.set(positions[o2], positions[o2 + 1], positions[o2 + 2]);
  CAP_N.copy(CAP_P1).sub(CAP_P0).cross(CAP_C.copy(CAP_P2).sub(CAP_P0));
  CAP_C.copy(CAP_P0).add(CAP_P1).add(CAP_P2).multiplyScalar(1 / 3);

  if (CAP_N.dot(CAP_C) < 0) {
    indices.push(i0, i2, i1);
    return;
  }

  indices.push(i0, i1, i2);
}

function buildPolarCapGeometry(
  coordinate: TileCoordinate,
  radius: number,
  uvBounds: UvBounds
): BufferGeometry | null {
  const hemisphere = getPolarHemisphere(coordinate);

  if (!hemisphere) {
    return null;
  }

  const bounds = getSurfaceTileBounds(coordinate);
  const edgeLat = hemisphere === "north" ? bounds.north : bounds.south;
  const poleLat = hemisphere === "north" ? 90 : -90;
  const edgeV = hemisphere === "north" ? uvBounds.maxV : uvBounds.minV;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let segment = 0; segment <= POLAR_CAP_SEGMENTS; segment += 1) {
    const t = segment / POLAR_CAP_SEGMENTS;
    const lng = bounds.west + (bounds.east - bounds.west) * t;
    const edge = cartographicToCartesian({ lng, lat: edgeLat, height: 0 }, radius);
    positions.push(edge.x, edge.y, edge.z);
    uvs.push(uvBounds.minU + (uvBounds.maxU - uvBounds.minU) * t, edgeV);
  }

  const pole = cartographicToCartesian(
    { lng: (bounds.west + bounds.east) * 0.5, lat: poleLat, height: 0 },
    radius
  );
  const poleIndex = positions.length / 3;
  positions.push(pole.x, pole.y, pole.z);
  uvs.push((uvBounds.minU + uvBounds.maxU) * 0.5, edgeV);

  for (let segment = 0; segment < POLAR_CAP_SEGMENTS; segment += 1) {
    appendOrientedTriangle(indices, positions, segment, segment + 1, poleIndex);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildEllipsoidTileGeometry(
  coordinate: TileCoordinate,
  radius: number,
  meshSegments: number
): BufferGeometry {
  const { west, east, south, north } = getSurfaceTileBounds(coordinate);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= meshSegments; row += 1) {
    const v = row / meshSegments;
    const lat = north + (south - north) * v;

    for (let column = 0; column <= meshSegments; column += 1) {
      const u = column / meshSegments;
      const lng = west + (east - west) * u;
      const cartesian = cartographicToCartesian({ lng, lat, height: 0 }, radius);
      positions.push(cartesian.x, cartesian.y, cartesian.z);
      uvs.push(u, 1 - v);
    }
  }

  const rowSize = meshSegments + 1;

  for (let row = 0; row < meshSegments; row += 1) {
    for (let column = 0; column < meshSegments; column += 1) {
      const topLeft = row * rowSize + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowSize;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function scaleCoordinateToZoom(coordinate: TileCoordinate, zoom: number): TileCoordinate {
  if (zoom === coordinate.z) {
    return coordinate;
  }

  if (zoom > coordinate.z) {
    const scale = 2 ** (zoom - coordinate.z);

    return {
      z: zoom,
      x: normalizeTileX(coordinate.x * scale, zoom),
      y: coordinate.y * scale
    };
  }

  const scale = 2 ** (coordinate.z - zoom);

  return {
    z: zoom,
    x: normalizeTileX(Math.floor(coordinate.x / scale), zoom),
    y: Math.floor(coordinate.y / scale)
  };
}

function isCoordinateWithinHost(
  coordinate: TileCoordinate,
  hostCoordinate: TileCoordinate
): boolean {
  if (coordinate.z < hostCoordinate.z) {
    return false;
  }

  if (coordinate.z === hostCoordinate.z) {
    return coordinate.x === hostCoordinate.x && coordinate.y === hostCoordinate.y;
  }

  const scale = 2 ** (coordinate.z - hostCoordinate.z);

  return (
    Math.floor(coordinate.x / scale) === hostCoordinate.x &&
    Math.floor(coordinate.y / scale) === hostCoordinate.y
  );
}

function resolveTextureSize(hostCoordinate: TileCoordinate, imageryZoom: number, tileSize: number): number {
  if (imageryZoom <= hostCoordinate.z) {
    return Math.max(1, Math.min(MAX_COMPOSED_TEXTURE_SIZE, tileSize));
  }

  const subdivision = 2 ** (imageryZoom - hostCoordinate.z);
  return Math.max(1, Math.min(MAX_COMPOSED_TEXTURE_SIZE, tileSize * subdivision));
}


function shortestWrappedTileDistance(x: number, centerX: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  const directDistance = Math.abs(x - centerX);
  return Math.min(directDistance, worldTileCount - directDistance);
}

function computeTilePriority(
  coordinate: TileCoordinate,
  centerCoordinate: TileCoordinate,
  role: RasterTileRequestRole
): number {
  const dx = shortestWrappedTileDistance(coordinate.x, centerCoordinate.x, coordinate.z);
  const dy = Math.abs(coordinate.y - centerCoordinate.y);
  const distancePenalty = dx * dx + dy * dy;
  const roleBoost = role === "fallback" ? FALLBACK_PRIORITY_BOOST : 0;
  return roleBoost + PRIORITY_BASELINE - distancePenalty;
}

function sortRequestsByPriority(requests: RasterTileRequest[]): RasterTileRequest[] {
  return [...requests].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.tileKey.localeCompare(right.tileKey);
  });
}

function createCoverageRequests(
  hostCoordinate: TileCoordinate,
  imageryZoom: number,
  textureSize: number,
  centerCoordinate: TileCoordinate,
  role: RasterTileRequestRole
): RasterTileRequest[] {
  if (imageryZoom >= hostCoordinate.z) {
    const subdivision = 2 ** (imageryZoom - hostCoordinate.z);
    const tileDrawSize = textureSize / subdivision;
    const baseX = hostCoordinate.x * subdivision;
    const baseY = hostCoordinate.y * subdivision;
    const requests: RasterTileRequest[] = [];

    for (let row = 0; row < subdivision; row += 1) {
      for (let column = 0; column < subdivision; column += 1) {
        const coordinate = {
          z: imageryZoom,
          x: normalizeTileX(baseX + column, imageryZoom),
          y: baseY + row
        };

        requests.push({
          coordinate,
          tileKey: tileCoordinateKey(coordinate),
          destinationX: column * tileDrawSize,
          destinationY: row * tileDrawSize,
          destinationSize: tileDrawSize,
          priority: computeTilePriority(coordinate, centerCoordinate, role),
          role
        });
      }
    }

    return sortRequestsByPriority(requests);
  }

  const subdivision = 2 ** (hostCoordinate.z - imageryZoom);
  const ancestorX = Math.floor(hostCoordinate.x / subdivision);
  const ancestorY = Math.floor(hostCoordinate.y / subdivision);
  const column = hostCoordinate.x - ancestorX * subdivision;
  const row = hostCoordinate.y - ancestorY * subdivision;
  const coordinate = {
    z: imageryZoom,
    x: normalizeTileX(ancestorX, imageryZoom),
    y: ancestorY
  };

  return [{
    coordinate,
    tileKey: tileCoordinateKey(coordinate),
    destinationX: 0,
    destinationY: 0,
    destinationSize: textureSize,
    priority: computeTilePriority(coordinate, centerCoordinate, role),
    role,
    sourceCrop: {
      x: column / subdivision,
      y: row / subdivision,
      width: 1 / subdivision,
      height: 1 / subdivision
    }
  }];
}


function getRequestSourceCropKey(sourceCrop?: SourceCropRegion): string {
  if (!sourceCrop) {
    return "none";
  }

  return `${sourceCrop.x}:${sourceCrop.y}:${sourceCrop.width}:${sourceCrop.height}`;
}

function getRasterRequestSignature(request: RasterTileRequest): string {
  return [
    request.tileKey,
    request.destinationX,
    request.destinationY,
    request.destinationSize,
    getRequestSourceCropKey(request.sourceCrop)
  ].join("|");
}

function createRequestForCoordinate(
  hostCoordinate: TileCoordinate,
  requestCoordinate: TileCoordinate,
  textureSize: number,
  centerCoordinate: TileCoordinate,
  role: RasterTileRequestRole
): RasterTileRequest | null {
  if (requestCoordinate.z >= hostCoordinate.z) {
    const subdivision = 2 ** (requestCoordinate.z - hostCoordinate.z);
    const tileDrawSize = textureSize / subdivision;
    const baseX = hostCoordinate.x * subdivision;
    const baseY = hostCoordinate.y * subdivision;
    const column = requestCoordinate.x - baseX;
    const row = requestCoordinate.y - baseY;

    if (column < 0 || column >= subdivision || row < 0 || row >= subdivision) {
      return null;
    }

    return {
      coordinate: requestCoordinate,
      tileKey: tileCoordinateKey(requestCoordinate),
      destinationX: column * tileDrawSize,
      destinationY: row * tileDrawSize,
      destinationSize: tileDrawSize,
      priority: computeTilePriority(requestCoordinate, centerCoordinate, role),
      role
    };
  }

  const subdivision = 2 ** (hostCoordinate.z - requestCoordinate.z);
  const ancestorX = Math.floor(hostCoordinate.x / subdivision);
  const ancestorY = Math.floor(hostCoordinate.y / subdivision);

  if (ancestorX !== requestCoordinate.x || ancestorY !== requestCoordinate.y) {
    return null;
  }

  const column = hostCoordinate.x - ancestorX * subdivision;
  const row = hostCoordinate.y - ancestorY * subdivision;

  return {
    coordinate: requestCoordinate,
    tileKey: tileCoordinateKey(requestCoordinate),
    destinationX: 0,
    destinationY: 0,
    destinationSize: textureSize,
    priority: computeTilePriority(requestCoordinate, centerCoordinate, role),
    role,
    sourceCrop: {
      x: column / subdivision,
      y: row / subdivision,
      width: 1 / subdivision,
      height: 1 / subdivision
    }
  };
}

function dedupeRasterRequests(requests: RasterTileRequest[]): RasterTileRequest[] {
  const deduped = new Map<string, RasterTileRequest>();

  for (const request of requests) {
    const signature = getRasterRequestSignature(request);
    const existing = deduped.get(signature);

    if (!existing || request.priority > existing.priority) {
      deduped.set(signature, request);
    }
  }

  return [...deduped.values()];
}

function resolveDetailRequestBudget(
  hostCoordinate: TileCoordinate,
  imageryZoom: number,
  interactionPhase: SurfaceTileInteractionPhase
): number {
  const zoomDelta = Math.max(0, imageryZoom - hostCoordinate.z);
  const theoreticalCoverageCount = Math.max(1, 2 ** (zoomDelta * 2));

  if (interactionPhase === "interacting") {
    return Math.max(
      1,
      Math.min(MAX_INTERACTING_DETAIL_REQUESTS_PER_HOST, theoreticalCoverageCount)
    );
  }

  return Math.max(
    1,
    Math.min(MAX_IDLE_DETAIL_REQUESTS_PER_HOST, theoreticalCoverageCount)
  );
}


function createRasterTilePlans(
  source: RasterTileSource,
  hostCoordinates: TileCoordinate[],
  detailCoordinates: TileCoordinate[],
  centerCoordinate: TileCoordinate,
  interactionPhase: SurfaceTileInteractionPhase
): RasterTilePlan[] {
  return hostCoordinates.flatMap((hostCoordinate) => {
    const hostKey = tileCoordinateKey(hostCoordinate);
    const matchingDetailCoordinates = detailCoordinates.filter((coordinate) =>
      isCoordinateWithinHost(coordinate, hostCoordinate)
    );

    const fallbackZoom = Math.max(
      source.minZoom,
      Math.min(source.maxZoom, hostCoordinate.z)
    );
    const scaledDetailCoordinates = [...new Map(
      matchingDetailCoordinates.map((coordinate) => {
        const clampedZoom = Math.max(
          source.minZoom,
          Math.min(source.maxZoom, coordinate.z)
        );

        return [
          tileCoordinateKey(scaleCoordinateToZoom(coordinate, clampedZoom)),
          scaleCoordinateToZoom(coordinate, clampedZoom)
        ] as const;
      })
    ).values()];
    const imageryZoom = Math.max(
      fallbackZoom,
      ...scaledDetailCoordinates.map((coordinate) => coordinate.z)
    );
    const textureSize = resolveTextureSize(hostCoordinate, imageryZoom, source.tileSize);
    const baseRequests = createCoverageRequests(
      hostCoordinate,
      fallbackZoom,
      textureSize,
      scaleCoordinateToZoom(centerCoordinate, fallbackZoom),
      "fallback"
    );
    const baseRequestSignatures = new Set(baseRequests.map((request) => getRasterRequestSignature(request)));
    const detailRequestCandidates = sortRequestsByPriority(
      dedupeRasterRequests(scaledDetailCoordinates.flatMap((coordinate) => {
        const request = createRequestForCoordinate(
          hostCoordinate,
          coordinate,
          textureSize,
          scaleCoordinateToZoom(centerCoordinate, coordinate.z),
          "detail"
        );

        if (!request || baseRequestSignatures.has(getRasterRequestSignature(request))) {
          return [];
        }

        return [request];
      }))
    );
    const detailRequestBudget = resolveDetailRequestBudget(
      hostCoordinate,
      imageryZoom,
      interactionPhase
    );
    const detailRequests = detailRequestCandidates.slice(0, detailRequestBudget);
    const requestKey = [
      hostKey,
      `target:${imageryZoom}`,
      `fallback:${baseRequests.map((request) => getRasterRequestSignature(request)).join(",")}`,
      `detail:${detailRequests.map((request) => getRasterRequestSignature(request)).join(",")}`
    ].join("|");

    return [{
      hostTileKey: hostKey,
      imageryZoom,
      textureSize,
      requestKey,
      baseRequests,
      detailRequests,
      requestedImageryTileKeys: [...new Set(
        [...baseRequests, ...detailRequests].map((request) => request.tileKey)
      )],
      requiresCompositing:
        detailRequests.length > 0 ||
        baseRequests.length > 1 ||
        baseRequests.some((request) => request.sourceCrop !== undefined)
    }];
  });
}

export class RasterLayer extends Layer {
  private readonly sourceId: string;
  private readonly opacity: number;
  private readonly imageryRetryAttempts: number;
  private readonly imageryRetryDelayMs: number;
  private readonly imageryFallbackColor: string | null;
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, RasterTileEntry>();
  private gpuComposer: RasterGpuComposer | null = null;
  private context: LayerContext | null = null;
  private cachedRecoveryConfig:
    | { attempts: number; delayMs: number; fallbackColor: string | null }
    | null = null;

  constructor(options: RasterLayerOptions) {
    super(options.id);
    this.sourceId = options.source;
    this.opacity = Math.max(0, Math.min(1, options.opacity ?? 1));
    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex;
    }
    this.imageryRetryAttempts = Math.max(0, Math.floor(options.imageryRetryAttempts ?? 0));
    this.imageryRetryDelayMs = Math.max(0, Math.floor(options.imageryRetryDelayMs ?? 0));
    this.imageryFallbackColor = options.imageryFallbackColor ?? null;
    this.group.name = options.id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    this.cachedRecoveryConfig = null;
    context.scene.add(this.group);
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    this.clearActiveTiles();
    this.disposeGpuComposer();
    this.context = null;
    this.cachedRecoveryConfig = null;
  }

  update(deltaTime: number, context: LayerContext): void {
    void deltaTime;
    this.syncTiles(context);
    this.syncHostGeometryBindings(context);
  }

  dispose(): void {
    this.clearActiveTiles();
    this.disposeGpuComposer();
  }

  hasRenderableTiles(): boolean {
    for (const entry of this.activeTiles.values()) {
      if (entry.mesh) {
        return true;
      }
    }

    return false;
  }

  getDebugStats(): {
    sourceId: string;
    activeTileCount: number;
    requestCount: number;
  } {
    let activeTileCount = 0;

    for (const entry of this.activeTiles.values()) {
      if (entry.mesh) {
        activeTileCount += 1;
      }
    }

    const source = this.context?.getSource?.(this.sourceId);
    const requestCount = source instanceof RasterTileSource ? source.getStats().requested : 0;

    return {
      sourceId: this.sourceId,
      activeTileCount,
      requestCount
    };
  }

  private syncTiles(context: LayerContext): void {
    const source = context.getSource?.(this.sourceId);

    if (!(source instanceof RasterTileSource)) {
      this.clearActiveTiles();
      return;
    }

    const viewportWidth =
      context.rendererElement?.clientWidth ||
      context.rendererElement?.width ||
      1;
    const viewportHeight =
      context.rendererElement?.clientHeight ||
      context.rendererElement?.height ||
      1;
    const imageryTargetZoom = computeTargetZoom({
      camera: context.camera,
      viewportWidth,
      viewportHeight,
      radius: context.radius,
      tileSize: source.tileSize,
      minZoom: source.minZoom,
      maxZoom: source.maxZoom
    });
    const interactionPhase = context.getSurfaceTilePlan?.().interactionPhase ?? "idle";

    const imageryPlan = planSurfaceTileNodes({
      camera: context.camera,
      viewportWidth,
      viewportHeight,
      radius: context.radius,
      meshMaxSegments: RASTER_IMAGERY_PLAN_MESH_SEGMENTS,
      minZoom: source.minZoom,
      maxZoom: imageryTargetZoom,
      interactionPhase
    });
    const detailCoordinates = uniqueSortedCoordinates(
      imageryPlan.nodes.map((node) => node.coordinate)
    );
    const host = context.getSurfaceHost?.();
    const hostCoordinates = host
      ? host.getActiveTileKeys().map((key) => parseTileKey(key))
      : detailCoordinates;
    const desiredPlans = createRasterTilePlans(
      source,
      uniqueSortedCoordinates(hostCoordinates),
      detailCoordinates,
      imageryPlan.centerCoordinate,
      imageryPlan.interactionPhase
    );
    const desiredEntries = new Map(
      desiredPlans.map((plan) => [plan.hostTileKey, plan] as const)
    );

    for (const plan of desiredEntries.values()) {
      if (host && !host.getActiveTileMesh(plan.hostTileKey)) {
        continue;
      }

      void this.ensureTile(plan);
    }

    for (const tileKey of [...this.activeTiles.keys()]) {
      if (desiredEntries.has(tileKey)) {
        continue;
      }

      this.removeTile(tileKey);
    }
  }

  private syncHostGeometryBindings(context: LayerContext): void {
    // 影像网格始终绑定当前 Surface host 的几何，保证影像/地形在同一宿主瓦片上原子替换。
    const host = context.getSurfaceHost?.();

    if (!host) {
      return;
    }

    let updatedAny = false;
    for (const [tileKey, entry] of this.activeTiles) {
      if (!entry.mesh || entry.loading) {
        continue;
      }

      const hostMesh = host.getActiveTileMesh(tileKey);
      if (!hostMesh) {
        continue;
      }

      const hostGeometryVersion = host.getActiveTileGeometryVersion?.(tileKey) ?? null;
      if (
        hostGeometryVersion !== null &&
        entry.hostGeometryVersion !== null &&
        hostGeometryVersion === entry.hostGeometryVersion
      ) {
        continue;
      }

      const hostCoordinate = parseTileKey(tileKey);
      updatedAny = this.syncMeshGeometryFromHost(
        entry.mesh,
        hostMesh.geometry,
        hostCoordinate,
        context.radius
      ) || updatedAny;
      entry.hostGeometryVersion = hostGeometryVersion;
    }

    if (updatedAny) {
      context.requestRender?.();
    }
  }

  private syncMeshGeometryFromHost(
    rasterMesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    hostGeometry: BufferGeometry,
    hostCoordinate: TileCoordinate,
    radius: number
  ): boolean {
    const rasterGeometry = rasterMesh.geometry;
    const hostPosition = hostGeometry.getAttribute("position");
    const rasterPosition = rasterGeometry.getAttribute("position");
    const hostIndexCount = hostGeometry.index?.count ?? 0;
    const rasterIndexCount = rasterGeometry.index?.count ?? 0;
    const canCopyInPlace =
      hostPosition instanceof BufferAttribute &&
      rasterPosition instanceof BufferAttribute &&
      hostPosition.array.length === rasterPosition.array.length &&
      hostPosition.itemSize === rasterPosition.itemSize &&
      hostIndexCount === rasterIndexCount;

    if (!canCopyInPlace) {
      const replacementGeometry = hostGeometry.clone();
      rasterMesh.geometry = replacementGeometry;
      this.disposeRasterGeometry(rasterGeometry);
      this.rebuildPolarCapMesh(rasterMesh, hostCoordinate, radius);
      return true;
    }

    (rasterPosition.array as Float32Array).set(hostPosition.array as ArrayLike<number>);
    rasterPosition.needsUpdate = true;

    const hostNormal = hostGeometry.getAttribute("normal");
    const rasterNormal = rasterGeometry.getAttribute("normal");
    if (
      hostNormal instanceof BufferAttribute &&
      rasterNormal instanceof BufferAttribute &&
      hostNormal.array.length === rasterNormal.array.length &&
      hostNormal.itemSize === rasterNormal.itemSize
    ) {
      (rasterNormal.array as Float32Array).set(hostNormal.array as ArrayLike<number>);
      rasterNormal.needsUpdate = true;
    }

    rasterGeometry.computeBoundingSphere();
    return true;
  }

  private rebuildPolarCapMesh(
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    coordinate: TileCoordinate,
    radius: number
  ): void {
    for (const child of [...mesh.children]) {
      if (!(child instanceof Mesh)) {
        continue;
      }
      mesh.remove(child);
      child.geometry.dispose();
    }

    this.attachPolarCapMesh(mesh, coordinate, radius);
  }

  private ensureTile(plan: RasterTilePlan): Promise<void> {
    let entry = this.activeTiles.get(plan.hostTileKey);

    if (!entry) {
      entry = {
        promise: Promise.resolve(),
        mesh: null,
        loading: false,
        hostTileKey: plan.hostTileKey,
        hostGeometryVersion: null,
        requestKey: "",
        requestedImageryTileKeys: [],
        version: 0,
        composedTarget: null,
        pendingDetailDraws: [],
        detailFlushScheduled: false
      };
      this.activeTiles.set(plan.hostTileKey, entry);
    }

    if (entry.requestKey === plan.requestKey && (entry.loading || entry.mesh)) {
      return entry.promise;
    }

    const previousRequestedTileKeys = entry.requestedImageryTileKeys;
    const source = this.context?.getSource?.(this.sourceId);
    const requestedImageryTileKeys = [...plan.requestedImageryTileKeys];
    const preservedTileKeys = new Set(requestedImageryTileKeys);

    entry.version += 1;
    entry.hostTileKey = plan.hostTileKey;
    entry.requestKey = plan.requestKey;
    entry.requestedImageryTileKeys = requestedImageryTileKeys;

    if (previousRequestedTileKeys.length > 0) {
      this.cancelImageryRequests(previousRequestedTileKeys, plan.hostTileKey, preservedTileKeys);
    }

    if (source instanceof RasterTileSource) {
      this.tryInstallCachedFallbackMesh(entry, plan, source);
    }

    const version = entry.version;
    const isCurrent = () =>
      this.activeTiles.get(plan.hostTileKey) === entry && entry.version === version;

    entry.loading = true;
    entry.promise = this.loadPlan(plan, entry, isCurrent)
      .catch((error) => {
        if (error instanceof StaleRasterTileError || isTileRequestAbort(error)) {
          return;
        }

        this.reportRasterError(error, plan.hostTileKey, {
          source: this.sourceId,
          hostTileKey: plan.hostTileKey
        });
      })
      .finally(() => {
        if (isCurrent()) {
          entry.loading = false;
        }
      });

    void entry.promise.catch(() => undefined);
    return entry.promise;
  }

  private async loadPlan(
    plan: RasterTilePlan,
    entry: RasterTileEntry,
    isCurrent: () => boolean
  ): Promise<void> {
    const context = this.context;

    if (!context) {
      throw new Error("RasterLayer missing context");
    }

    const host = context.getSurfaceHost?.();
    const hostMesh = host?.getActiveTileMesh(plan.hostTileKey) ?? null;
    const hostGeometryVersion = host?.getActiveTileGeometryVersion?.(plan.hostTileKey) ?? null;
    if (host && !hostMesh) {
      throw new Error(`RasterLayer missing host mesh for tile ${plan.hostTileKey}`);
    }
    const hostCoordinate = parseTileKey(plan.hostTileKey);
    const hostGeometry = hostMesh
      ? hostMesh.geometry.clone()
      : buildEllipsoidTileGeometry(hostCoordinate, context.radius, RASTER_ELLIPSOID_MESH_SEGMENTS);

    const source = context.getSource?.(this.sourceId);

    if (!(source instanceof RasterTileSource)) {
      throw new Error(`RasterLayer source "${this.sourceId}" is not a RasterTileSource`);
    }

    const recoveryConfig = this.cachedRecoveryConfig ?? (
      this.cachedRecoveryConfig = resolveImageryRecoveryConfig(context, this.id, {
        attempts: this.imageryRetryAttempts,
        delayMs: this.imageryRetryDelayMs,
        fallbackColor: this.imageryFallbackColor
      })
    );
    const baseTiles = await this.loadBaseTilesWithAncestorFallback(
      source,
      plan,
      hostCoordinate,
      recoveryConfig,
      isCurrent
    );

    if (!isCurrent()) {
      throw new StaleRasterTileError();
    }

    if (plan.requiresCompositing) {
      const surface = this.createCompositedMesh(
        context,
        hostGeometry,
        hostCoordinate,
        plan,
        baseTiles,
        context.radius
      );

      if (!isCurrent()) {
        this.disposeRasterMesh(surface.mesh, { disposeMap: false });
        surface.target.dispose();
        throw new StaleRasterTileError();
      }

      this.swapEntryMesh(entry, surface.mesh, surface.target);
      entry.hostGeometryVersion = hostGeometryVersion;
      this.context?.requestRender?.();
      this.startDetailRequests(entry, plan, source, recoveryConfig, isCurrent);
      return;
    }

    const mesh = this.createDirectMesh(
      hostGeometry,
      hostCoordinate,
      plan,
      baseTiles[0].source,
      context.radius
    );

    if (!isCurrent()) {
      this.disposeRasterMesh(mesh);
      throw new StaleRasterTileError();
    }

    this.swapEntryMesh(entry, mesh, null);
    entry.hostGeometryVersion = hostGeometryVersion;
    this.context?.requestRender?.();
  }

  private async loadBaseTilesWithAncestorFallback(
    source: RasterTileSource,
    plan: RasterTilePlan,
    hostCoordinate: TileCoordinate,
    recoveryConfig: { attempts: number; delayMs: number; fallbackColor: string | null },
    isCurrent: () => boolean
  ): Promise<LoadedRasterTile[]> {
    let candidateRequests = plan.baseRequests.length > 0 ? plan.baseRequests : plan.detailRequests;
    if (candidateRequests.length === 0) {
      throw new Error(`RasterLayer missing base requests for tile ${plan.hostTileKey}`);
    }

    let lastError: unknown = null;
    let currentZoom = candidateRequests.reduce(
      (zoom, request) => Math.max(zoom, request.coordinate.z),
      source.minZoom
    );

    while (candidateRequests.length > 0) {
      if (!isCurrent()) {
        throw new StaleRasterTileError();
      }

      try {
        return await Promise.all(candidateRequests.map(async (request) => ({
          request,
          source: await this.requestImageryTile(
            source,
            plan.hostTileKey,
            request,
            recoveryConfig,
            isCurrent
          )
        })));
      } catch (error) {
        if (error instanceof StaleRasterTileError || isTileRequestAbort(error)) {
          throw error;
        }

        lastError = error;
      }

      const nextZoom = currentZoom - 1;
      if (nextZoom < source.minZoom) {
        break;
      }

      candidateRequests = createCoverageRequests(
        hostCoordinate,
        nextZoom,
        plan.textureSize,
        scaleCoordinateToZoom(hostCoordinate, nextZoom),
        "fallback"
      );
      currentZoom = nextZoom;
    }

    throw lastError ?? new Error(`RasterLayer failed to resolve fallback imagery for ${plan.hostTileKey}`);
  }

  private resolveCachedFallbackTiles(
    source: RasterTileSource,
    hostCoordinate: TileCoordinate,
    targetZoom: number,
    textureSize: number
  ): LoadedRasterTile[] | null {
    for (let zoom = targetZoom; zoom >= source.minZoom; zoom -= 1) {
      const requests = createCoverageRequests(
        hostCoordinate,
        zoom,
        textureSize,
        scaleCoordinateToZoom(hostCoordinate, zoom),
        "fallback"
      );
      const loaded: LoadedRasterTile[] = [];
      let complete = true;

      for (const request of requests) {
        const cached = source.getCached(request.tileKey);

        if (!cached) {
          complete = false;
          break;
        }

        loaded.push({
          request,
          source: cached
        });
      }

      if (complete) {
        return loaded;
      }
    }

    return null;
  }

  private tryInstallCachedFallbackMesh(
    entry: RasterTileEntry,
    plan: RasterTilePlan,
    source: RasterTileSource
  ): void {
    if (entry.mesh) {
      return;
    }

    const context = this.context;

    if (!context) {
      return;
    }

    const hostCoordinate = parseTileKey(plan.hostTileKey);
    const cachedTiles = this.resolveCachedFallbackTiles(
      source,
      hostCoordinate,
      plan.imageryZoom,
      plan.textureSize
    );

    if (!cachedTiles || cachedTiles.length === 0) {
      return;
    }

    const host = context.getSurfaceHost?.();
    const hostMesh = host?.getActiveTileMesh(plan.hostTileKey) ?? null;

    if (host && !hostMesh) {
      return;
    }

    const hostGeometry = hostMesh
      ? hostMesh.geometry.clone()
      : buildEllipsoidTileGeometry(hostCoordinate, context.radius, RASTER_ELLIPSOID_MESH_SEGMENTS);

    const requiresCompositing =
      cachedTiles.length > 1 || cachedTiles.some((tile) => tile.request.sourceCrop !== undefined);
    const hostGeometryVersion = host?.getActiveTileGeometryVersion?.(plan.hostTileKey) ?? null;

    if (requiresCompositing) {
      const surface = this.createCompositedMesh(
        context,
        hostGeometry,
        hostCoordinate,
        plan,
        cachedTiles,
        context.radius
      );
      this.swapEntryMesh(entry, surface.mesh, surface.target);
      entry.hostGeometryVersion = hostGeometryVersion;
      context.requestRender?.();
      return;
    }

    const mesh = this.createDirectMesh(
      hostGeometry,
      hostCoordinate,
      plan,
      cachedTiles[0].source,
      context.radius
    );
    this.swapEntryMesh(entry, mesh, null);
    entry.hostGeometryVersion = hostGeometryVersion;
    context.requestRender?.();
  }

  private createDirectMesh(
    hostGeometry: BufferGeometry,
    hostCoordinate: TileCoordinate,
    plan: RasterTilePlan,
    source: TileSource,
    radius: number
  ): Mesh<BufferGeometry, MeshStandardMaterial> {
    const texture = createTexture(source);
    const material = this.createMaterial(texture);
    const mesh = new Mesh(hostGeometry, material);
    mesh.name = `${this.id}:${plan.hostTileKey}:z${plan.imageryZoom}`;
    const zBucket = Math.max(0, this.zIndex ?? this.addOrder);
    mesh.renderOrder = RASTER_BASE + zBucket * ZINDEX_STRIDE + this.addOrder;
    this.attachPolarCapMesh(mesh, hostCoordinate, radius);
    return mesh;
  }

  private createCompositedMesh(
    context: LayerContext,
    hostGeometry: BufferGeometry,
    hostCoordinate: TileCoordinate,
    plan: RasterTilePlan,
    tiles: LoadedRasterTile[],
    radius: number
  ): {
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
    target: WebGLRenderTarget;
  } {
    const composer = this.getGpuComposer(context);
    const target = composer.createRenderTarget(plan.textureSize);
    try {
      composer.composeTiles(target, tiles.map((tile) => ({
        request: tile.request,
        source: tile.source
      })));
    } catch (error) {
      target.dispose();
      throw error;
    }
    const texture = target.texture;
    const material = this.createMaterial(texture);
    const mesh = new Mesh(hostGeometry, material);
    mesh.name = `${this.id}:${plan.hostTileKey}:z${plan.imageryZoom}`;
    const zBucket = Math.max(0, this.zIndex ?? this.addOrder);
    mesh.renderOrder = RASTER_BASE + zBucket * ZINDEX_STRIDE + this.addOrder;
    this.attachPolarCapMesh(mesh, hostCoordinate, radius);

    return {
      mesh,
      target
    };
  }

  private createMaterial(texture: Texture): MeshStandardMaterial {
    return new MeshStandardMaterial({
      map: texture,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  private swapEntryMesh(
    entry: RasterTileEntry,
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    target: WebGLRenderTarget | null
  ): void {
    if (entry.mesh) {
      this.group.remove(entry.mesh);
      this.disposeRasterMesh(entry.mesh, { disposeMap: entry.composedTarget === null });
    }

    if (entry.composedTarget) {
      entry.composedTarget.dispose();
      entry.composedTarget = null;
    }

    entry.pendingDetailDraws.length = 0;
    entry.detailFlushScheduled = false;
    entry.mesh = mesh;
    entry.composedTarget = target;
    this.group.add(mesh);
  }

  private startDetailRequests(
    entry: RasterTileEntry,
    plan: RasterTilePlan,
    source: RasterTileSource,
    recoveryConfig: { attempts: number; delayMs: number; fallbackColor: string | null },
    isCurrent: () => boolean
  ): void {
    if (plan.detailRequests.length === 0) {
      return;
    }

    for (const request of plan.detailRequests) {
      void this.requestImageryTile(source, plan.hostTileKey, request, recoveryConfig, isCurrent)
        .then((tileSource) => {
          if (!isCurrent()) {
            return;
          }

          const activeEntry = this.activeTiles.get(plan.hostTileKey);

          if (
            activeEntry !== entry ||
            !activeEntry.mesh ||
            !activeEntry.composedTarget
          ) {
            return;
          }

          const context = this.context;

          if (!context) {
            return;
          }

          try {
            this.enqueueDetailDraw(activeEntry, {
              request,
              source: tileSource
            });
          } catch (renderError) {
            this.emitLayerError(this.context, {
              stage: "imagery",
              category: "render",
              severity: "warn",
              error: renderError,
              recoverable: true,
              tileKey: request.tileKey,
              metadata: {
                source: this.sourceId,
                coordinate: request.coordinate,
                hostTileKey: plan.hostTileKey,
                role: request.role
              }
            });
          }
        })
        .catch((error) => {
          if (error instanceof StaleRasterTileError || isTileRequestAbort(error)) {
            return;
          }

          this.reportRasterError(error, request.tileKey, {
            source: this.sourceId,
            coordinate: request.coordinate,
            hostTileKey: plan.hostTileKey,
            role: request.role
          });
        });
    }
  }

  private async requestImageryTile(
    source: RasterTileSource,
    hostTileKey: string,
    request: RasterTileRequest,
    recoveryConfig: { attempts: number; delayMs: number; fallbackColor: string | null },
    isCurrent: () => boolean
  ): Promise<TileSource> {
    let lastError: unknown = null;
    let attemptsUsed = 0;

    for (let attempt = 0; attempt <= recoveryConfig.attempts; attempt += 1) {
      attemptsUsed = attempt + 1;

      if (!isCurrent()) {
        throw new StaleRasterTileError();
      }

      try {
        return await source.request(request.coordinate, { priority: request.priority });
      } catch (error) {
        if (isTileRequestAbort(error)) {
          throw error;
        }

        lastError = error;

        if (attempt < recoveryConfig.attempts) {
          if (recoveryConfig.delayMs > 0) {
            await sleep(recoveryConfig.delayMs);
          } else {
            await new Promise<void>((resolve) => {
              queueMicrotask(resolve);
            });
          }
          continue;
        }

        if (recoveryConfig.fallbackColor) {
          this.emitLayerError(this.context, {
            stage: "imagery",
            category: "network",
            severity: "warn",
            error: lastError,
            recoverable: true,
            tileKey: request.tileKey,
            metadata: {
              source: this.sourceId,
              coordinate: request.coordinate,
              hostTileKey,
              attempts: attemptsUsed,
              fallbackUsed: true,
              role: request.role
            }
          });

          return createSolidColorFallback(recoveryConfig.fallbackColor);
        }

        throw new RasterTileLoadError({
          tileKey: request.tileKey,
          coordinate: request.coordinate,
          hostTileKey,
          attemptsUsed,
          originalError: error
        });
      }
    }

    throw new RasterTileLoadError({
      tileKey: request.tileKey,
      coordinate: request.coordinate,
      hostTileKey,
      attemptsUsed,
      originalError: lastError
    });
  }

  private reportRasterError(
    error: unknown,
    fallbackTileKey: string,
    metadata: Record<string, unknown>
  ): void {
    if (error instanceof RasterTileLoadError) {
      this.emitLayerError(this.context, {
        stage: "imagery",
        category: "network",
        severity: "warn",
        error: error.originalError,
        recoverable: true,
        tileKey: error.tileKey,
        metadata: {
          ...metadata,
          coordinate: error.coordinate,
          hostTileKey: error.hostTileKey,
          attempts: error.attemptsUsed
        }
      });
      return;
    }

    this.emitLayerError(this.context, {
      stage: "imagery",
      category: "network",
      severity: "warn",
      error,
      recoverable: true,
      tileKey: fallbackTileKey,
      metadata
    });
  }

  private cancelImageryRequests(
    tileKeys: string[],
    currentHostTileKey: string,
    preservedTileKeys: ReadonlySet<string> = new Set()
  ): void {
    const source = this.context?.getSource?.(this.sourceId);

    if (!(source instanceof RasterTileSource)) {
      return;
    }

    for (const tileKey of tileKeys) {
      if (preservedTileKeys.has(tileKey)) {
        continue;
      }

      const hasOtherReference = [...this.activeTiles.values()].some((entry) =>
        entry.hostTileKey !== currentHostTileKey &&
        entry.requestedImageryTileKeys.includes(tileKey)
      );

      if (!hasOtherReference) {
        source.cancel(tileKey);
      }
    }
  }

  private removeTile(tileKey: string): boolean {
    const entry = this.activeTiles.get(tileKey);

    if (!entry) {
      return false;
    }

    this.cancelImageryRequests(entry.requestedImageryTileKeys, entry.hostTileKey);

    if (entry.mesh) {
      this.group.remove(entry.mesh);
      this.disposeRasterMesh(entry.mesh, { disposeMap: entry.composedTarget === null });
    }

    if (entry.composedTarget) {
      entry.composedTarget.dispose();
      entry.composedTarget = null;
    }

    entry.pendingDetailDraws.length = 0;
    entry.detailFlushScheduled = false;
    this.activeTiles.delete(tileKey);
    return true;
  }

  private clearActiveTiles(): void {
    for (const key of [...this.activeTiles.keys()]) {
      this.removeTile(key);
    }
  }

  private enqueueDetailDraw(entry: RasterTileEntry, draw: GpuTileDrawItem): void {
    entry.pendingDetailDraws.push(draw);

    if (entry.detailFlushScheduled) {
      return;
    }

    entry.detailFlushScheduled = true;
    window.setTimeout(() => {
      entry.detailFlushScheduled = false;

      const activeEntry = this.activeTiles.get(entry.hostTileKey);
      if (activeEntry !== entry || !entry.mesh || !entry.composedTarget) {
        entry.pendingDetailDraws.length = 0;
        return;
      }

      if (entry.pendingDetailDraws.length === 0) {
        return;
      }

      const context = this.context;
      if (!context) {
        entry.pendingDetailDraws.length = 0;
        return;
      }

      const draws = entry.pendingDetailDraws.splice(0, entry.pendingDetailDraws.length);
      try {
        this.getGpuComposer(context).drawTiles(entry.composedTarget, draws);
        this.context?.requestRender?.();
      } catch (error) {
        this.emitLayerError(this.context, {
          stage: "imagery",
          category: "render",
          severity: "warn",
          error,
          recoverable: true,
          metadata: {
            source: this.sourceId,
            hostTileKey: entry.hostTileKey,
            drawCount: draws.length
          }
        });
      }
    }, 0);
  }

  private disposeRasterGeometry(geometry: BufferGeometry): void {
    geometry.dispose();
  }

  private disposeRasterMesh(
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    options: { disposeMap?: boolean } = {}
  ): void {
    const disposeMap = options.disposeMap ?? true;

    for (const child of mesh.children) {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    }

    if (disposeMap) {
      mesh.material.map?.dispose();
    }

    mesh.material.dispose();
    this.disposeRasterGeometry(mesh.geometry);
  }

  private getGpuComposer(context: LayerContext): RasterGpuComposer {
    const renderer = context.getRenderer?.() ?? null;

    if (!renderer) {
      throw new Error("RasterLayer missing renderer for GPU composition");
    }

    if (!this.gpuComposer) {
      this.gpuComposer = new RasterGpuComposer(renderer);
    }

    return this.gpuComposer;
  }

  private disposeGpuComposer(): void {
    this.gpuComposer?.dispose();
    this.gpuComposer = null;
  }

  private attachPolarCapMesh(
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    coordinate: TileCoordinate,
    radius: number
  ): void {
    const capGeometry = buildPolarCapGeometry(coordinate, radius, resolveUvBounds(mesh.geometry));

    if (!capGeometry) {
      return;
    }

    const capMesh = new Mesh(capGeometry, mesh.material);
    capMesh.name = `${mesh.name}:polar-cap`;
    capMesh.renderOrder = mesh.renderOrder;
    mesh.add(capMesh);
  }
}
