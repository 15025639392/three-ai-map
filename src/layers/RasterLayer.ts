import {
  BufferGeometry,
  ClampToEdgeWrapping,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import { RasterTileSource } from "../sources/RasterTileSource";
import { TileRequestCancelledError } from "../tiles/TileScheduler";
import { type TileCoordinate } from "../tiles/TileViewport";
import type { SurfaceTilePlan } from "../tiles/SurfaceTilePlanner";
import type { TileSource } from "../tiles/tileLoader";
import { getSurfaceTileBounds } from "../tiles/SurfaceTileTree";
import { Layer, LayerContext } from "./Layer";

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
  previousMesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  loading: boolean;
  hostTileKey: string;
  requestKey: string;
  requestedImageryTileKeys: string[];
  version: number;
  composedCanvas: HTMLCanvasElement | null;
  composedContext: CanvasRenderingContext2D | null;
  transitionElapsedMs: number;
  previousTransitionElapsedMs: number;
  transitionState: "none" | "fadeIn" | "fadeOut";
  keepUntilFadeOut: boolean;
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
  morphFactor: number;
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
  const texture = source instanceof HTMLCanvasElement
    ? new CanvasTexture(source)
    : new Texture(source as Exclude<TileSource, HTMLCanvasElement>);
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
const RASTER_CROSSFADE_DURATION_MS = 220;
const RASTER_CROSSFADE_EPSILON = 1e-4;
const POLAR_CAP_SEGMENTS = 10;
const MAX_INTERACTING_DETAIL_REQUESTS_PER_HOST = 16;
const MAX_IDLE_DETAIL_REQUESTS_PER_HOST = 48;

const CAP_P0 = new Vector3();
const CAP_P1 = new Vector3();
const CAP_P2 = new Vector3();
const CAP_N = new Vector3();
const CAP_C = new Vector3();

function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
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

function getTileSourceSize(source: TileSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height
    };
  }

  return {
    width: source.width,
    height: source.height
  };
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
  interactionPhase: SurfaceTilePlan["interactionPhase"]
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


function createSharedRasterTilePlans(
  source: RasterTileSource,
  hostCoordinates: TileCoordinate[],
  sharedPlan: SurfaceTilePlan
): RasterTilePlan[] {
  const sharedNodesByKey = new Map(sharedPlan.nodes.map((node) => [node.key, node] as const));

  return hostCoordinates.flatMap((hostCoordinate) => {
    const hostKey = tileCoordinateKey(hostCoordinate);
    const matchingSharedCoordinates = sharedPlan.nodes
      .map((node) => node.coordinate)
      .filter((coordinate) => isCoordinateWithinHost(coordinate, hostCoordinate));

    if (matchingSharedCoordinates.length === 0) {
      return [];
    }

    const fallbackZoom = Math.max(source.minZoom, Math.min(source.maxZoom, hostCoordinate.z));
    const detailCoordinates = [...new Map(
      matchingSharedCoordinates.map((coordinate) => {
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
      ...detailCoordinates.map((coordinate) => coordinate.z)
    );
    const textureSize = resolveTextureSize(hostCoordinate, imageryZoom, source.tileSize);
    const baseRequests = createCoverageRequests(
      hostCoordinate,
      fallbackZoom,
      textureSize,
      scaleCoordinateToZoom(sharedPlan.centerCoordinate, fallbackZoom),
      "fallback"
    );
    const baseRequestSignatures = new Set(baseRequests.map((request) => getRasterRequestSignature(request)));
    const detailRequestCandidates = sortRequestsByPriority(
      dedupeRasterRequests(detailCoordinates.flatMap((coordinate) => {
        const request = createRequestForCoordinate(
          hostCoordinate,
          coordinate,
          textureSize,
          scaleCoordinateToZoom(sharedPlan.centerCoordinate, coordinate.z),
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
      sharedPlan.interactionPhase
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
      morphFactor: Math.max(
        0,
        Math.min(1, sharedNodesByKey.get(hostKey)?.morphFactor ?? 1)
      ),
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

function createComposedCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size));
  canvas.height = Math.max(1, Math.round(size));
  return canvas;
}

function drawRasterTile(
  context: CanvasRenderingContext2D,
  request: RasterTileRequest,
  tile: TileSource
): void {
  const image = tile as CanvasImageSource;

  if (!request.sourceCrop) {
    context.drawImage(
      image,
      request.destinationX,
      request.destinationY,
      request.destinationSize,
      request.destinationSize
    );
    return;
  }

  const { width, height } = getTileSourceSize(tile);
  context.drawImage(
    image,
    request.sourceCrop.x * width,
    request.sourceCrop.y * height,
    request.sourceCrop.width * width,
    request.sourceCrop.height * height,
    request.destinationX,
    request.destinationY,
    request.destinationSize,
    request.destinationSize
  );
}

export class RasterLayer extends Layer {
  private readonly sourceId: string;
  private readonly opacity: number;
  private readonly imageryRetryAttempts: number;
  private readonly imageryRetryDelayMs: number;
  private readonly imageryFallbackColor: string | null;
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, RasterTileEntry>();
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
    this.context = null;
    this.cachedRecoveryConfig = null;
  }

  update(deltaTime: number, context: LayerContext): void {
    this.syncTiles(context);

    if (this.stepTransitions(deltaTime)) {
      context.requestRender?.();
    }
  }

  dispose(): void {
    this.clearActiveTiles();
  }

  private syncTiles(context: LayerContext): void {
    const host = context.getTerrainHost?.();

    if (!host) {
      this.clearActiveTiles();
      return;
    }

    const source = context.getSource?.(this.sourceId);

    if (!(source instanceof RasterTileSource)) {
      this.clearActiveTiles();
      return;
    }

    const hostKeys = host.getActiveTileKeys();
    const hostCoordinates = hostKeys.map((key) => parseTileKey(key));
    const sharedPlan = context.getSurfaceTilePlan?.();

    if (!sharedPlan) {
      this.clearActiveTiles();
      return;
    }

    const desiredPlans = createSharedRasterTilePlans(source, hostCoordinates, sharedPlan);
    const desiredEntries = new Map(
      desiredPlans.map((plan) => [plan.hostTileKey, plan] as const)
    );

    for (const key of [...this.activeTiles.keys()]) {
      if (!desiredEntries.has(key)) {
        this.markTileFadingOut(key);
      }
    }

    for (const plan of desiredEntries.values()) {
      if (!host.getActiveTileMesh(plan.hostTileKey)) {
        continue;
      }

      const existing = this.activeTiles.get(plan.hostTileKey);

      if (existing?.keepUntilFadeOut) {
        existing.keepUntilFadeOut = false;
        existing.transitionState = existing.mesh ? "fadeIn" : "none";
        existing.transitionElapsedMs = 0;
      }

      void this.ensureTile(plan);
    }
  }

  private markTileFadingOut(tileKey: string): void {
    const entry = this.activeTiles.get(tileKey);

    if (!entry) {
      return;
    }

    if (entry.keepUntilFadeOut) {
      return;
    }

    entry.keepUntilFadeOut = true;
    entry.transitionElapsedMs = 0;
    entry.transitionState = entry.mesh ? "fadeOut" : "none";
    if (!entry.mesh) {
      this.removeTile(tileKey);
      return;
    }

    this.context?.requestRender?.();
  }

  private stepTransitions(deltaTime: number): boolean {
    const safeDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    let updated = false;

    for (const [tileKey, entry] of this.activeTiles) {
      if (entry.previousMesh) {
        entry.previousTransitionElapsedMs += safeDelta;
        const fadeOutFactor = Math.max(
          0,
          1 - entry.previousTransitionElapsedMs / RASTER_CROSSFADE_DURATION_MS
        );
        updated = this.setMeshOpacity(entry.previousMesh, fadeOutFactor) || updated;

        if (fadeOutFactor <= RASTER_CROSSFADE_EPSILON) {
          this.group.remove(entry.previousMesh);
          this.disposeRasterMesh(entry.previousMesh);
          entry.previousMesh = null;
          entry.previousTransitionElapsedMs = 0;
          updated = true;
        }
      }

      if (!entry.mesh) {
        if (entry.keepUntilFadeOut) {
          this.removeTile(tileKey);
          updated = true;
        }
        continue;
      }

      if (entry.transitionState === "fadeIn") {
        entry.transitionElapsedMs += safeDelta;
        const fadeInFactor = Math.min(1, entry.transitionElapsedMs / RASTER_CROSSFADE_DURATION_MS);
        updated = this.setMeshOpacity(entry.mesh, fadeInFactor) || updated;

        if (fadeInFactor >= 1 - RASTER_CROSSFADE_EPSILON) {
          entry.transitionState = "none";
          entry.transitionElapsedMs = 0;
        }
      } else if (entry.transitionState === "fadeOut" && entry.keepUntilFadeOut) {
        entry.transitionElapsedMs += safeDelta;
        const fadeOutFactor = Math.max(
          0,
          1 - entry.transitionElapsedMs / RASTER_CROSSFADE_DURATION_MS
        );
        updated = this.setMeshOpacity(entry.mesh, fadeOutFactor) || updated;

        if (fadeOutFactor <= RASTER_CROSSFADE_EPSILON) {
          this.removeTile(tileKey);
          updated = true;
        }
      }
    }

    return updated;
  }

  private setMeshOpacity(
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    factor: number
  ): boolean {
    const clampedFactor = Math.max(0, Math.min(1, factor));
    const nextOpacity = this.opacity * clampedFactor;
    const material = mesh.material;
    const changed =
      Math.abs(material.opacity - nextOpacity) > RASTER_CROSSFADE_EPSILON ||
      material.transparent !== (nextOpacity < 1 - RASTER_CROSSFADE_EPSILON);
    material.opacity = nextOpacity;
    material.transparent = nextOpacity < 1 - RASTER_CROSSFADE_EPSILON;
    material.needsUpdate = changed;
    return changed;
  }

  private ensureTile(plan: RasterTilePlan): Promise<void> {
    let entry = this.activeTiles.get(plan.hostTileKey);

    if (!entry) {
      entry = {
        promise: Promise.resolve(),
        mesh: null,
        previousMesh: null,
        loading: false,
        hostTileKey: plan.hostTileKey,
        requestKey: "",
        requestedImageryTileKeys: [],
        version: 0,
        composedCanvas: null,
        composedContext: null,
        transitionElapsedMs: 0,
        previousTransitionElapsedMs: 0,
        transitionState: "none",
        keepUntilFadeOut: false
      };
      this.activeTiles.set(plan.hostTileKey, entry);
    }

    if (entry.requestKey === plan.requestKey && (entry.loading || entry.mesh)) {
      if (!entry.keepUntilFadeOut && entry.transitionState === "none" && entry.mesh) {
        this.setMeshOpacity(entry.mesh, plan.morphFactor);
      }
      return entry.promise;
    }

    const previousRequestedTileKeys = entry.requestedImageryTileKeys;
    const preservedTileKeys = new Set(plan.requestedImageryTileKeys);

    entry.version += 1;
    entry.hostTileKey = plan.hostTileKey;
    entry.requestKey = plan.requestKey;
    entry.requestedImageryTileKeys = [...plan.requestedImageryTileKeys];

    if (previousRequestedTileKeys.length > 0) {
      this.cancelImageryRequests(previousRequestedTileKeys, plan.hostTileKey, preservedTileKeys);
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

    const host = context.getTerrainHost?.();

    if (!host) {
      throw new Error("RasterLayer requires a TerrainTileLayer host");
    }

    const hostMesh = host.getActiveTileMesh(plan.hostTileKey);

    if (!hostMesh) {
      throw new Error(`RasterLayer missing host mesh for tile ${plan.hostTileKey}`);
    }

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
    const baseRequests = plan.baseRequests.length > 0 ? plan.baseRequests : plan.detailRequests;
    const baseTiles = await Promise.all(baseRequests.map(async (request) => ({
      request,
      source: await this.requestImageryTile(
        source,
        plan.hostTileKey,
        request,
        recoveryConfig,
        isCurrent
      )
    })));

    if (!isCurrent()) {
      throw new StaleRasterTileError();
    }

    if (plan.requiresCompositing) {
      const surface = this.createCompositedMesh(hostMesh, plan, baseTiles, context.radius);

      if (!isCurrent()) {
        this.disposeRasterMesh(surface.mesh);
        throw new StaleRasterTileError();
      }

      this.swapEntryMesh(entry, surface.mesh, surface.canvas, surface.context2d, plan.morphFactor);
      this.context?.requestRender?.();
      this.startDetailRequests(entry, plan, source, recoveryConfig, isCurrent);
      return;
    }

    const mesh = this.createDirectMesh(hostMesh, plan, baseTiles[0].source, context.radius);

    if (!isCurrent()) {
      this.disposeRasterMesh(mesh);
      throw new StaleRasterTileError();
    }

    this.swapEntryMesh(entry, mesh, null, null, plan.morphFactor);
    this.context?.requestRender?.();
  }

  private createDirectMesh(
    hostMesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    plan: RasterTilePlan,
    source: TileSource,
    radius: number
  ): Mesh<BufferGeometry, MeshStandardMaterial> {
    const texture = createTexture(source);
    const material = this.createMaterial(texture);
    const mesh = new Mesh(hostMesh.geometry.clone(), material);
    mesh.name = `${this.id}:${plan.hostTileKey}:z${plan.imageryZoom}`;
    const zBucket = Math.max(0, this.zIndex ?? this.addOrder);
    mesh.renderOrder = RASTER_BASE + zBucket * ZINDEX_STRIDE + this.addOrder;
    this.attachPolarCapMesh(mesh, parseTileKey(plan.hostTileKey), radius);
    return mesh;
  }

  private createCompositedMesh(
    hostMesh: Mesh<BufferGeometry, MeshStandardMaterial>,
    plan: RasterTilePlan,
    tiles: LoadedRasterTile[],
    radius: number
  ): {
    mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
    canvas: HTMLCanvasElement;
    context2d: CanvasRenderingContext2D;
  } {
    const canvas = createComposedCanvas(plan.textureSize);
    const context2d = canvas.getContext("2d");

    if (!context2d) {
      throw new Error("RasterLayer missing 2D canvas context");
    }

    context2d.clearRect(0, 0, canvas.width, canvas.height);
    context2d.imageSmoothingEnabled = true;

    for (const tile of tiles) {
      drawRasterTile(context2d, tile.request, tile.source);
    }

    const texture = createTexture(canvas);
    const material = this.createMaterial(texture);
    const mesh = new Mesh(hostMesh.geometry.clone(), material);
    mesh.name = `${this.id}:${plan.hostTileKey}:z${plan.imageryZoom}`;
    const zBucket = Math.max(0, this.zIndex ?? this.addOrder);
    mesh.renderOrder = RASTER_BASE + zBucket * ZINDEX_STRIDE + this.addOrder;
    this.attachPolarCapMesh(mesh, parseTileKey(plan.hostTileKey), radius);

    return {
      mesh,
      canvas,
      context2d
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
    canvas: HTMLCanvasElement | null,
    context2d: CanvasRenderingContext2D | null,
    morphFactor: number
  ): void {
    if (entry.previousMesh) {
      this.group.remove(entry.previousMesh);
      this.disposeRasterMesh(entry.previousMesh);
      entry.previousMesh = null;
      entry.previousTransitionElapsedMs = 0;
    }

    if (entry.mesh) {
      entry.previousMesh = entry.mesh;
      entry.previousTransitionElapsedMs = 0;
      this.setMeshOpacity(entry.previousMesh, 1);
    }

    entry.mesh = mesh;
    entry.composedCanvas = canvas;
    entry.composedContext = context2d;
    this.group.add(mesh);

    const clampedMorphFactor = Math.max(0, Math.min(1, morphFactor));
    const initialOpacityFactor = entry.previousMesh ? 0 : clampedMorphFactor;
    this.setMeshOpacity(mesh, initialOpacityFactor);
    entry.transitionElapsedMs = initialOpacityFactor * RASTER_CROSSFADE_DURATION_MS;
    entry.transitionState = initialOpacityFactor < 1 - RASTER_CROSSFADE_EPSILON || entry.previousMesh
      ? "fadeIn"
      : "none";
    entry.keepUntilFadeOut = false;
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
            !activeEntry.composedContext
          ) {
            return;
          }

          drawRasterTile(activeEntry.composedContext, request, tileSource);
          if (activeEntry.mesh.material.map) {
            activeEntry.mesh.material.map.needsUpdate = true;
          }
          this.context?.requestRender?.();
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

    if (entry.previousMesh) {
      this.group.remove(entry.previousMesh);
      this.disposeRasterMesh(entry.previousMesh);
      entry.previousMesh = null;
    }

    if (entry.mesh) {
      this.group.remove(entry.mesh);
      this.disposeRasterMesh(entry.mesh);
    }

    entry.composedCanvas = null;
    entry.composedContext = null;
    this.activeTiles.delete(tileKey);
    return true;
  }

  private clearActiveTiles(): void {
    for (const key of [...this.activeTiles.keys()]) {
      this.removeTile(key);
    }
  }

  private disposeRasterMesh(mesh: Mesh<BufferGeometry, MeshStandardMaterial>): void {
    for (const child of mesh.children) {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    }
    mesh.material.map?.dispose();
    mesh.material.dispose();
    mesh.geometry.dispose();
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
