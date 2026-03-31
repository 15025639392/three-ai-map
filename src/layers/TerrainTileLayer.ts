import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial
} from "three";
import { WGS84_RADIUS } from "../geo/ellipsoid";
import { cartographicToCartesian } from "../geo/projection";
import { TileCache } from "../tiles/TileCache";
import { TerrariumDecoder, TerrariumDecoderStats } from "../tiles/TerrariumDecoder";
import { TileRequestCancelledError, TileScheduler } from "../tiles/TileScheduler";
import { corsTileLoader, type TileSource } from "../tiles/tileLoader";
import {
  getSurfaceTileBounds,
} from "../tiles/SurfaceTileTree";
import { shouldRequestDemForCoordinate, type LngLatBounds } from "../tiles/LngLatBounds";
import { pickTileTemplate } from "../tiles/TileUrlPicker";
import { Layer, LayerContext, LayerRecoveryOverrides } from "./Layer";
import type { SurfaceTilePlannerConfig, TerrainTileHost } from "./TerrainTileHost";
import type { TileCoordinate } from "../tiles/TileViewport";
import type { ElevationEncoding } from "../tiles/ElevationEncoding";
import type { SurfaceTileSelection, SurfaceTileSelectionOptions } from "../tiles/SurfaceTilePlanner";

export interface TerrainConfig {
  tiles: string[];
  encode: ElevationEncoding;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  cache?: number;
  extraBounds?: LngLatBounds[];
}

export interface ElevationTileData {
  width: number;
  height: number;
  data: Float32Array;
}

export interface CoordTransformFn {
  (lng: number, lat: number): { lng: number; lat: number };
}

export interface TerrainTileLayerOptions {
  terrain: TerrainConfig;
  meshSegments?: number;
  concurrency?: number;
  elevationExaggeration?: number;
  zoomExaggerationBoost?: number;
  skirtDepthMeters?: number;
  textureUvInsetPixels?: number;
  // Legacy no-op option kept only to avoid breaking existing examples.
  selectTiles?: (options: SurfaceTileSelectionOptions) => SurfaceTileSelection;
  loadElevationTile?: (
    coordinate: TileCoordinate,
    signal?: AbortSignal
  ) => Promise<ElevationTileData>;
  coordTransform?: CoordTransformFn;
}

type TerrainDisplayState = "parentFallback" | "readyLeaf";

interface TileSkirtMask {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

interface TerrainGeomorphState {
  basePositions: Float32Array;
  targetPositions: Float32Array;
  currentFactor: number;
  targetFactor: number;
}

interface TerrainTileEntry {
  coordinate: TileCoordinate;
  promise: Promise<void>;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  skirtMaskKey: string;
  displayState: TerrainDisplayState;
  visible: boolean;
  geomorph: TerrainGeomorphState | null;
}

interface LoadedTerrainTileMesh {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  geomorph: TerrainGeomorphState | null;
}

class StaleTerrainTileError extends Error {
  constructor() {
    super("Terrain tile entry is no longer current");
  }
}

const TERRAIN_GEOMORPH_DURATION_MS = 220;
const TERRAIN_GEOMORPH_EPSILON = 1e-4;

function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function getParentCoordinate(coordinate: TileCoordinate): TileCoordinate {
  return {
    z: Math.max(0, coordinate.z - 1),
    x: Math.floor(coordinate.x / 2),
    y: Math.floor(coordinate.y / 2)
  };
}

function getChildCoordinates(coordinate: TileCoordinate): TileCoordinate[] {
  const childZoom = coordinate.z + 1;
  const baseX = coordinate.x * 2;
  const baseY = coordinate.y * 2;

  return [
    { z: childZoom, x: normalizeTileX(baseX, childZoom), y: baseY },
    { z: childZoom, x: normalizeTileX(baseX + 1, childZoom), y: baseY },
    { z: childZoom, x: normalizeTileX(baseX, childZoom), y: baseY + 1 },
    { z: childZoom, x: normalizeTileX(baseX + 1, childZoom), y: baseY + 1 }
  ];
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

function buildSelectionKey(coordinates: TileCoordinate[]): string {
  return uniqueSortedCoordinates(coordinates)
    .map((coordinate) => tileCoordinateKey(coordinate))
    .join("|");
}

function createDefaultSkirtMask(): TileSkirtMask {
  return { top: true, right: true, bottom: true, left: true };
}

function encodeSkirtMask(mask: TileSkirtMask): string {
  return `${mask.top ? "1" : "0"}${mask.right ? "1" : "0"}${mask.bottom ? "1" : "0"}${mask.left ? "1" : "0"}`;
}

function computeTileSkirtMasks(coordinates: TileCoordinate[]): Map<string, TileSkirtMask> {
  const masks = new Map<string, TileSkirtMask>();
  const keySet = new Set(coordinates.map((coordinate) => tileCoordinateKey(coordinate)));

  for (const coordinate of coordinates) {
    const key = tileCoordinateKey(coordinate);
    const worldTileCount = 2 ** coordinate.z;
    const hasTopNeighbor =
      coordinate.y > 0 &&
      keySet.has(tileCoordinateKey({
        z: coordinate.z,
        x: coordinate.x,
        y: coordinate.y - 1
      }));
    const hasBottomNeighbor =
      coordinate.y < worldTileCount - 1 &&
      keySet.has(tileCoordinateKey({
        z: coordinate.z,
        x: coordinate.x,
        y: coordinate.y + 1
      }));
    const hasLeftNeighbor = keySet.has(tileCoordinateKey({
      z: coordinate.z,
      x: normalizeTileX(coordinate.x - 1, coordinate.z),
      y: coordinate.y
    }));
    const hasRightNeighbor = keySet.has(tileCoordinateKey({
      z: coordinate.z,
      x: normalizeTileX(coordinate.x + 1, coordinate.z),
      y: coordinate.y
    }));

    masks.set(key, {
      top: !hasTopNeighbor,
      right: !hasRightNeighbor,
      bottom: !hasBottomNeighbor,
      left: !hasLeftNeighbor
    });
  }

  return masks;
}

function sampleElevation(tile: ElevationTileData, u: number, v: number): number {
  const x = u * (tile.width - 1);
  const y = v * (tile.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(tile.width - 1, x0 + 1);
  const y1 = Math.min(tile.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const topLeft = tile.data[y0 * tile.width + x0];
  const topRight = tile.data[y0 * tile.width + x1];
  const bottomLeft = tile.data[y1 * tile.width + x0];
  const bottomRight = tile.data[y1 * tile.width + x1];
  const top = topLeft * (1 - tx) + topRight * tx;
  const bottom = bottomLeft * (1 - tx) + bottomRight * tx;

  return top * (1 - ty) + bottom * ty;
}

function appendSkirt(
  positions: number[],
  uvs: number[],
  indices: number[],
  edgeIndices: number[],
  skirtDepth: number
): void {
  if (edgeIndices.length < 2 || skirtDepth <= 0) {
    return;
  }

  const skirtStart = positions.length / 3;

  for (const edgeIndex of edgeIndices) {
    const offset = edgeIndex * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const length = Math.sqrt(x * x + y * y + z * z) || 1;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const skirtX = x - nx * skirtDepth;
    const skirtY = y - ny * skirtDepth;
    const skirtZ = z - nz * skirtDepth;

    positions.push(skirtX, skirtY, skirtZ);
    const uvOffset = edgeIndex * 2;
    uvs.push(uvs[uvOffset], uvs[uvOffset + 1]);
  }

  for (let index = 0; index < edgeIndices.length - 1; index += 1) {
    const topLeft = edgeIndices[index];
    const topRight = edgeIndices[index + 1];
    const bottomLeft = skirtStart + index;
    const bottomRight = skirtStart + index + 1;
    // Counter-clockwise winding for outward-facing normals.
    indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
  }
}

function buildTerrainTileGeometry(
  coordinate: TileCoordinate,
  radius: number,
  meshSegments: number,
  elevationTile: ElevationTileData | null,
  elevationExaggeration: number,
  skirtDepthMeters: number,
  textureUvInset: number,
  skirtMask: TileSkirtMask,
  coordTransform?: CoordTransformFn
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
      let lng = west + (east - west) * u;
      let latOut = lat;
      const heightMeters = elevationTile ? sampleElevation(elevationTile, u, v) : 0;
      const height = (heightMeters / WGS84_RADIUS) * radius * elevationExaggeration;

      if (coordTransform) {
        const transformed = coordTransform(lng, latOut);
        lng = transformed.lng;
        latOut = transformed.lat;
      }

      const cartesian = cartographicToCartesian(
        {
          lng,
          lat: latOut,
          height
        },
        radius
      );

      positions.push(cartesian.x, cartesian.y, cartesian.z);
      const insetU = textureUvInset + u * (1 - textureUvInset * 2);
      const insetV = textureUvInset + (1 - v) * (1 - textureUvInset * 2);
      uvs.push(insetU, insetV);
    }
  }

  const rowSize = meshSegments + 1;

  for (let row = 0; row < meshSegments; row += 1) {
    for (let column = 0; column < meshSegments; column += 1) {
      const topLeft = row * rowSize + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowSize;
      const bottomRight = bottomLeft + 1;
      // Counter-clockwise winding for outward-facing normals.
      indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
    }
  }

  if (skirtDepthMeters > 0) {
    const skirtDepth = (skirtDepthMeters / WGS84_RADIUS) * radius * elevationExaggeration;
    const topEdge = Array.from({ length: rowSize }, (_, index) => index);
    const bottomEdge = Array.from({ length: rowSize }, (_, index) => meshSegments * rowSize + index);
    const leftEdge = Array.from({ length: rowSize }, (_, index) => index * rowSize);
    const rightEdge = Array.from({ length: rowSize }, (_, index) => index * rowSize + meshSegments);

    if (skirtMask.top) {
      appendSkirt(positions, uvs, indices, topEdge, skirtDepth);
    }
    if (skirtMask.bottom) {
      appendSkirt(positions, uvs, indices, bottomEdge, skirtDepth);
    }
    if (skirtMask.left) {
      appendSkirt(positions, uvs, indices, leftEdge, skirtDepth);
    }
    if (skirtMask.right) {
      appendSkirt(positions, uvs, indices, rightEdge, skirtDepth);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.surfaceVertexCount = rowSize * rowSize;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function copyGeometryPositions(geometry: BufferGeometry): Float32Array | null {
  const positionAttribute = geometry.getAttribute("position");

  if (!(positionAttribute instanceof Float32BufferAttribute)) {
    return null;
  }

  return new Float32Array(positionAttribute.array);
}

function resolveSurfaceVertexCount(geometry: BufferGeometry): number {
  const value = geometry.userData.surfaceVertexCount;
  return typeof value === "number" && value > 0 ? value : 0;
}

function sampleSurfacePosition(
  positions: Float32Array,
  gridSize: number,
  u: number,
  v: number
): [number, number, number] {
  const x = Math.max(0, Math.min(gridSize - 1, u * (gridSize - 1)));
  const y = Math.max(0, Math.min(gridSize - 1, v * (gridSize - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(gridSize - 1, x0 + 1);
  const y1 = Math.min(gridSize - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const index = (row: number, column: number) => (row * gridSize + column) * 3;
  const i00 = index(y0, x0);
  const i10 = index(y0, x1);
  const i01 = index(y1, x0);
  const i11 = index(y1, x1);
  const x00 = positions[i00];
  const y00 = positions[i00 + 1];
  const z00 = positions[i00 + 2];
  const x10 = positions[i10];
  const y10 = positions[i10 + 1];
  const z10 = positions[i10 + 2];
  const x01 = positions[i01];
  const y01 = positions[i01 + 1];
  const z01 = positions[i01 + 2];
  const x11 = positions[i11];
  const y11 = positions[i11 + 1];
  const z11 = positions[i11 + 2];
  const blend = (
    topLeft: number,
    topRight: number,
    bottomLeft: number,
    bottomRight: number
  ) => {
    const top = topLeft * (1 - tx) + topRight * tx;
    const bottom = bottomLeft * (1 - tx) + bottomRight * tx;
    return top * (1 - ty) + bottom * ty;
  };

  return [
    blend(x00, x10, x01, x11),
    blend(y00, y10, y01, y11),
    blend(z00, z10, z01, z11)
  ];
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

async function defaultElevationLoader(
  coordinate: TileCoordinate,
  templateUrl: string,
  decoder: TerrariumDecoder,
  encoding: ElevationEncoding,
  signal?: AbortSignal
): Promise<ElevationTileData> {
  const source = await corsTileLoader(coordinate, templateUrl, signal);
  const canvas = document.createElement("canvas");
  canvas.width = "width" in source ? source.width : 256;
  canvas.height = "height" in source ? source.height : 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Elevation decode canvas context is not available");
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (signal?.aborted) {
    throw signal.reason;
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const heights = await decoder.decode(canvas.width, canvas.height, imageData.data, encoding);

  if (signal?.aborted) {
    throw signal.reason;
  }

  return {
    width: canvas.width,
    height: canvas.height,
    data: heights
  };
}

function computeTextureUvInset(tileSize: number, insetPixels: number): number {
  if (tileSize <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(0.25, insetPixels / tileSize));
}

function resolveElevationRecoveryConfig(
  context: LayerContext | null,
  layerId: string,
  overrides: LayerRecoveryOverrides | undefined
): { attempts: number; delayMs: number } {
  const baseAttempts = overrides?.elevationRetryAttempts ?? 0;
  const baseDelayMs = overrides?.elevationRetryDelayMs ?? 0;
  const resolvedAttempts = Math.max(0, Math.floor(baseAttempts));
  const resolvedDelayMs = Math.max(0, Math.floor(baseDelayMs));

  if (!context?.resolveRecovery) {
    return { attempts: resolvedAttempts, delayMs: resolvedDelayMs };
  }

  const engineOverrides = context.resolveRecovery({
    layerId,
    stage: "tile-load",
    category: "network",
    severity: "warn"
  });

  const attempts = Math.max(
    0,
    Math.floor(engineOverrides?.elevationRetryAttempts ?? resolvedAttempts)
  );
  const delayMs = Math.max(
    0,
    Math.floor(engineOverrides?.elevationRetryDelayMs ?? resolvedDelayMs)
  );

  return { attempts, delayMs };
}

export class TerrainTileLayer extends Layer implements TerrainTileHost {
  private readonly terrain: TerrainConfig;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly tileSize: number;
  private readonly meshSegments: number;
  private readonly skirtDepthMeters: number;
  private readonly textureUvInsetPixels: number;
  private readonly elevationExaggeration: number;
  private readonly zoomExaggerationBoost: number;
  private readonly coordTransform?: CoordTransformFn;
  private readonly elevationCache: TileCache<ElevationTileData>;
  private readonly elevationScheduler: TileScheduler<ElevationTileData, TileCoordinate>;
  private readonly terrariumDecoder = new TerrariumDecoder();
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, TerrainTileEntry>();
  private displayTileKeys = new Set<string>();
  private context: LayerContext | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private currentSelectionKey = "";
  private currentDisplayKey = "";
  private renderInvalidationQueued = false;
  private readonly elevationRetryAttempts: number;
  private readonly elevationRetryDelayMs: number;
  private cachedElevationRecoveryConfig: { attempts: number; delayMs: number } | null = null;

  constructor(id: string, options: TerrainTileLayerOptions) {
    super(id);
    this.terrain = options.terrain;
    this.minZoom = options.terrain.minZoom ?? 1;
    this.maxZoom = options.terrain.maxZoom ?? 8;
    this.tileSize = options.terrain.tileSize ?? 256;
    this.meshSegments = options.meshSegments ?? 16;
    this.skirtDepthMeters = options.skirtDepthMeters ?? 900;
    this.textureUvInsetPixels = options.textureUvInsetPixels ?? 0.5;
    this.elevationExaggeration = options.elevationExaggeration ?? 1.15;
    this.zoomExaggerationBoost = options.zoomExaggerationBoost ?? 0;
    this.coordTransform = options.coordTransform;
    this.elevationRetryAttempts = 0;
    this.elevationRetryDelayMs = 0;
    this.elevationCache = new TileCache<ElevationTileData>(options.terrain.cache ?? 96);

    const tiles = options.terrain.tiles;
    const encoding = options.terrain.encode;
    const loadElevationTile =
      options.loadElevationTile ??
      ((coordinate: TileCoordinate, signal?: AbortSignal) =>
        defaultElevationLoader(
          coordinate,
          pickTileTemplate(tiles, coordinate),
          this.terrariumDecoder,
          encoding,
          signal
        ));

    this.elevationScheduler = new TileScheduler({
      concurrency: options.concurrency ?? 6,
      loadTile: loadElevationTile
    });

    this.group.name = id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    this.cachedElevationRecoveryConfig = null;
    context.scene.add(this.group);
    this.syncTiles(context);
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    this.clearActiveTiles();
    this.context = null;
    this.cachedElevationRecoveryConfig = null;
    this.displayTileKeys.clear();
    this.currentSelectionKey = "";
    this.currentDisplayKey = "";
  }

  update(deltaTime: number, context: LayerContext): void {
    this.syncTiles(context, deltaTime);
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  getActiveTileKeys(): string[] {
    return [...this.displayTileKeys].sort();
  }

  getActiveTileMesh(key: string): Mesh<BufferGeometry, MeshStandardMaterial> | null {
    if (!this.displayTileKeys.has(key)) {
      return null;
    }

    return this.activeTiles.get(key)?.mesh ?? null;
  }

  getSurfaceTilePlannerConfig(): SurfaceTilePlannerConfig {
    return {
      tileSize: this.tileSize,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom
    };
  }

  getDebugStats(): {
    activeTileCount: number;
    activeTileKeys: string[];
    elevation: ReturnType<TileScheduler<ElevationTileData, TileCoordinate>["getStats"]>;
    terrariumDecode: TerrariumDecoderStats;
  } {
    return {
      activeTileCount: this.displayTileKeys.size,
      activeTileKeys: this.getActiveTileKeys(),
      elevation: this.elevationScheduler.getStats(),
      terrariumDecode: this.terrariumDecoder.getStats()
    };
  }

  dispose(): void {
    this.clearActiveTiles();
    this.elevationCache.clear();
    this.elevationScheduler.clear();
    this.terrariumDecoder.dispose();
  }

  private syncTiles(context: LayerContext, deltaTime = 0): void {
    const sharedPlan = context.getSurfaceTilePlan?.();

    if (!sharedPlan) {
      this.currentSelectionKey = "";
      this.currentDisplayKey = "";
      this.displayTileKeys.clear();
      const removedAny = this.clearActiveTiles();
      this.readyPromise = Promise.resolve();

      if (removedAny) {
        this.invalidateRender();
      }

      return;
    }

    const desiredCoordinates = uniqueSortedCoordinates(sharedPlan.nodes.map((node) => node.coordinate));
    const desiredMorphFactors = new Map(
      sharedPlan.nodes.map((node) => [node.key, node.morphFactor] as const)
    );
    const desiredTileSkirtMasks = computeTileSkirtMasks(desiredCoordinates);
    const selectionKey = buildSelectionKey(desiredCoordinates);

    if (!selectionKey) {
      this.currentSelectionKey = "";
      this.currentDisplayKey = "";
      this.displayTileKeys.clear();
      const removedAny = this.clearActiveTiles();
      this.readyPromise = Promise.resolve();

      if (removedAny) {
        this.invalidateRender();
      }

      return;
    }

    const preloadPromises = desiredCoordinates.map((coordinate) =>
      this.ensureTile(
        coordinate,
        context.radius,
        desiredTileSkirtMasks.get(tileCoordinateKey(coordinate)) ?? createDefaultSkirtMask(),
        "readyLeaf"
      )
    );
    const displayCoordinates = this.resolveDisplayCoordinates(desiredCoordinates);
    const displayTileSkirtMasks = computeTileSkirtMasks(displayCoordinates);
    const displayKey = buildSelectionKey(displayCoordinates);
    const displayResolved = displayCoordinates.every((coordinate) => {
      const key = tileCoordinateKey(coordinate);
      const entry = this.activeTiles.get(key);

      return entry?.mesh !== null && entry?.skirtMaskKey ===
        encodeSkirtMask(displayTileSkirtMasks.get(key) ?? createDefaultSkirtMask());
    });

    if (
      selectionKey === this.currentSelectionKey &&
      displayKey === this.currentDisplayKey &&
      displayResolved
    ) {
      const desiredKeys = new Set(
        desiredCoordinates.map((coordinate) => tileCoordinateKey(coordinate))
      );
      const nextDisplayKeys = new Set(
        displayCoordinates.map((coordinate) => tileCoordinateKey(coordinate))
      );
      this.displayTileKeys = nextDisplayKeys;
      this.updateDisplayStates(desiredKeys, nextDisplayKeys, desiredMorphFactors);

      if (this.advanceGeomorph(deltaTime)) {
        this.invalidateRender();
      }

      return;
    }

    this.currentSelectionKey = selectionKey;
    this.currentDisplayKey = displayKey;
    const desiredKeys = new Set(
      desiredCoordinates.map((coordinate) => tileCoordinateKey(coordinate))
    );
    const nextDisplayKeys = new Set(
      displayCoordinates.map((coordinate) => tileCoordinateKey(coordinate))
    );
    const keepKeys = new Set<string>([...desiredKeys, ...nextDisplayKeys]);

    let removedAny = false;

    for (const key of [...this.activeTiles.keys()]) {
      if (!keepKeys.has(key)) {
        removedAny = this.removeTile(key) || removedAny;
      }
    }

    this.displayTileKeys = nextDisplayKeys;
    this.updateDisplayStates(desiredKeys, nextDisplayKeys, desiredMorphFactors);

    if (removedAny) {
      this.invalidateRender();
    }

    const displayPromises = displayCoordinates.map((coordinate) =>
      this.ensureTile(
        coordinate,
        context.radius,
        displayTileSkirtMasks.get(tileCoordinateKey(coordinate)) ?? createDefaultSkirtMask(),
        desiredKeys.has(tileCoordinateKey(coordinate)) ? "readyLeaf" : "parentFallback"
      )
    );

    this.readyPromise = Promise.allSettled(
      [...preloadPromises, ...displayPromises].map((promise) =>
        promise.catch(() => undefined)
      )
    ).then(() => undefined);

    if (this.advanceGeomorph(deltaTime)) {
      this.invalidateRender();
    }
  }

  private resolveDisplayCoordinates(desiredCoordinates: TileCoordinate[]): TileCoordinate[] {
    const desiredKeys = new Set(
      desiredCoordinates.map((coordinate) => tileCoordinateKey(coordinate))
    );
    const displayCoordinates: TileCoordinate[] = [];

    for (const coordinate of desiredCoordinates) {
      const resolved = this.resolveDisplayCoordinate(coordinate, desiredKeys);

      if (!resolved) {
        continue;
      }

      displayCoordinates.push(resolved);
    }

    return uniqueSortedCoordinates(displayCoordinates);
  }

  private resolveDisplayCoordinate(
    coordinate: TileCoordinate,
    desiredKeys: Set<string>
  ): TileCoordinate | null {
    let current: TileCoordinate | null = coordinate;

    while (current) {
      const key = tileCoordinateKey(current);
      const entry = this.activeTiles.get(key);

      if (
        entry?.mesh &&
        (current.z < coordinate.z || this.areSelectedSiblingsReady(current, desiredKeys))
      ) {
        return current;
      }

      if (current.z === 0) {
        return null;
      }

      current = getParentCoordinate(current);
    }

    return null;
  }

  private areSelectedSiblingsReady(
    coordinate: TileCoordinate,
    desiredKeys: Set<string>
  ): boolean {
    if (coordinate.z === 0) {
      return true;
    }

    const parent = getParentCoordinate(coordinate);
    const siblingKeys = getChildCoordinates(parent)
      .map((childCoordinate) => tileCoordinateKey(childCoordinate))
      .filter((key) => desiredKeys.has(key));

    if (siblingKeys.length === 0) {
      return true;
    }

    return siblingKeys.every((key) => this.activeTiles.get(key)?.mesh);
  }

  private updateDisplayStates(
    desiredKeys: Set<string>,
    displayKeys: Set<string>,
    desiredMorphFactors: ReadonlyMap<string, number>
  ): void {
    for (const [key, entry] of this.activeTiles) {
      const visible = displayKeys.has(key);
      entry.visible = visible;
      const nextDisplayState: TerrainDisplayState = visible
        ? (desiredKeys.has(key) ? "readyLeaf" : "parentFallback")
        : entry.displayState;
      entry.displayState = nextDisplayState;

      if (entry.mesh) {
        entry.mesh.visible = visible;
      }

      if (!entry.geomorph) {
        continue;
      }

      if (!visible || nextDisplayState === "parentFallback") {
        const needsReset = Math.abs(entry.geomorph.currentFactor - 1) > TERRAIN_GEOMORPH_EPSILON ||
          Math.abs(entry.geomorph.targetFactor - 1) > TERRAIN_GEOMORPH_EPSILON;
        entry.geomorph.targetFactor = 1;
        entry.geomorph.currentFactor = 1;
        if (needsReset) {
          this.applyGeomorphFactor(entry, 1);
        }
        continue;
      }

      entry.geomorph.targetFactor = Math.max(
        0,
        Math.min(1, desiredMorphFactors.get(key) ?? 1)
      );
    }
  }

  private advanceGeomorph(deltaTime: number): boolean {
    const safeDeltaTime = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    const step = TERRAIN_GEOMORPH_DURATION_MS <= 0
      ? 1
      : safeDeltaTime / TERRAIN_GEOMORPH_DURATION_MS;
    let hasActiveAnimation = false;
    let updatedAny = false;

    for (const entry of this.activeTiles.values()) {
      if (!entry.visible || !entry.mesh || !entry.geomorph) {
        continue;
      }

      const target = Math.max(0, Math.min(1, entry.geomorph.targetFactor));
      const current = Math.max(0, Math.min(1, entry.geomorph.currentFactor));
      const delta = target - current;

      if (Math.abs(delta) <= TERRAIN_GEOMORPH_EPSILON) {
        if (Math.abs(current - target) > TERRAIN_GEOMORPH_EPSILON) {
          entry.geomorph.currentFactor = target;
          this.applyGeomorphFactor(entry, target);
          updatedAny = true;
        }
        continue;
      }

      hasActiveAnimation = true;
      const nextFactor = step <= 0
        ? current
        : (delta > 0
          ? Math.min(target, current + step)
          : Math.max(target, current - step));

      if (Math.abs(nextFactor - current) <= TERRAIN_GEOMORPH_EPSILON) {
        continue;
      }

      entry.geomorph.currentFactor = nextFactor;
      this.applyGeomorphFactor(entry, nextFactor);
      updatedAny = true;
      hasActiveAnimation = hasActiveAnimation || Math.abs(target - nextFactor) > TERRAIN_GEOMORPH_EPSILON;
    }

    return updatedAny || hasActiveAnimation;
  }

  private applyGeomorphFactor(entry: TerrainTileEntry, factor: number): void {
    if (!entry.mesh || !entry.geomorph) {
      return;
    }

    const positionAttribute = entry.mesh.geometry.getAttribute("position");

    if (!(positionAttribute instanceof Float32BufferAttribute)) {
      return;
    }

    const clamped = Math.max(0, Math.min(1, factor));
    const { basePositions, targetPositions } = entry.geomorph;
    const next = positionAttribute.array as Float32Array;

    if (
      next.length !== basePositions.length ||
      next.length !== targetPositions.length
    ) {
      entry.geomorph = null;
      return;
    }

    for (let index = 0; index < next.length; index += 1) {
      next[index] = basePositions[index] + (targetPositions[index] - basePositions[index]) * clamped;
    }

    positionAttribute.needsUpdate = true;
    entry.mesh.geometry.computeVertexNormals();
    entry.mesh.geometry.computeBoundingSphere();
  }

  private computeElevationExaggeration(zoom: number): number {
    if (this.zoomExaggerationBoost <= 0 || this.maxZoom <= this.minZoom) {
      return this.elevationExaggeration;
    }

    const t = (zoom - this.minZoom) / (this.maxZoom - this.minZoom);
    return this.elevationExaggeration + t * this.zoomExaggerationBoost;
  }

  private ensureTile(
    coordinate: TileCoordinate,
    radius: number,
    skirtMask: TileSkirtMask,
    displayState: TerrainDisplayState
  ): Promise<void> {
    const key = tileCoordinateKey(coordinate);
    const existing = this.activeTiles.get(key);
    const skirtMaskKey = encodeSkirtMask(skirtMask);

    if (existing && existing.skirtMaskKey === skirtMaskKey) {
      existing.displayState = displayState;
      return existing.promise;
    }

    const entry: TerrainTileEntry = existing ?? {
      coordinate,
      promise: Promise.resolve(),
      mesh: null,
      skirtMaskKey,
      displayState,
      visible: false,
      geomorph: null
    };
    entry.coordinate = coordinate;
    entry.skirtMaskKey = skirtMaskKey;
    entry.displayState = displayState;
    this.activeTiles.set(key, entry);

    const isCurrent = () => this.activeTiles.get(key) === entry;
    const elevationExaggeration = this.computeElevationExaggeration(coordinate.z);

    entry.promise = this.loadTileMesh(coordinate, radius, skirtMask, elevationExaggeration, isCurrent)
      .then((loaded) => {
        if (!isCurrent()) {
          loaded.mesh.geometry.dispose();
          loaded.mesh.material.dispose();
          throw new StaleTerrainTileError();
        }

        if (entry.mesh) {
          this.group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          entry.mesh.material.dispose();
        }

        entry.mesh = loaded.mesh;
        entry.geomorph = loaded.geomorph;
        entry.mesh.visible = entry.visible;
        this.group.add(loaded.mesh);
        if (entry.geomorph) {
          this.applyGeomorphFactor(entry, entry.geomorph.currentFactor);
        }
        this.invalidateRender();
      })
      .catch((error) => {
        if (error instanceof StaleTerrainTileError || isTileRequestAbort(error)) {
          return;
        }

        // If elevation failed, keep rendering a flat tile (fallback to 0) and report a warning.
        this.emitLayerError(this.context, {
          stage: "tile-load",
          category: "network",
          severity: "warn",
          error,
          recoverable: true,
          tileKey: key,
          metadata: { coordinate }
        });

        if (!isCurrent()) {
          return;
        }

        // Build a flat tile mesh so the surface remains continuous.
        const geometry = buildTerrainTileGeometry(
          coordinate,
          radius,
          this.meshSegments,
          null,
          elevationExaggeration,
          this.skirtDepthMeters,
          computeTextureUvInset(this.tileSize, this.textureUvInsetPixels),
          skirtMask,
          this.coordTransform
        );
        const material = new MeshStandardMaterial({
          color: 0x3a3a3a,
          depthTest: true,
          depthWrite: true
        });
        const mesh = new Mesh(geometry, material);
        mesh.name = key;
        mesh.renderOrder = 0;

        if (entry.mesh) {
          this.group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          entry.mesh.material.dispose();
        }

        entry.mesh = mesh;
        entry.geomorph = null;
        entry.mesh.visible = entry.visible;
        this.group.add(mesh);
        this.invalidateRender();
      });

    void entry.promise.catch(() => undefined);
    return entry.promise;
  }

  private async loadTileMesh(
    coordinate: TileCoordinate,
    radius: number,
    skirtMask: TileSkirtMask,
    elevationExaggeration: number,
    isCurrent: () => boolean
  ): Promise<LoadedTerrainTileMesh> {
    const key = tileCoordinateKey(coordinate);

    if (!isCurrent()) {
      throw new StaleTerrainTileError();
    }

    const needsDem = shouldRequestDemForCoordinate(coordinate, this.terrain.extraBounds);
    let elevation: ElevationTileData | null = null;

    if (needsDem) {
      elevation = this.elevationCache.get(key) ?? null;

      if (!elevation) {
        elevation = await this.loadElevationWithRecovery(key, coordinate);
        if (elevation) {
          this.elevationCache.set(key, elevation);
        }
      }
    }

    if (!isCurrent()) {
      throw new StaleTerrainTileError();
    }

    const geometry = buildTerrainTileGeometry(
      coordinate,
      radius,
      this.meshSegments,
      elevation,
      elevationExaggeration,
      this.skirtDepthMeters,
      computeTextureUvInset(this.tileSize, this.textureUvInsetPixels),
      skirtMask,
      this.coordTransform
    );

    const material = new MeshStandardMaterial({
      color: 0x3a3a3a,
      depthTest: true,
      depthWrite: true
    });

    if (!isCurrent()) {
      geometry.dispose();
      material.dispose();
      throw new StaleTerrainTileError();
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = key;
    mesh.renderOrder = 0;
    return {
      mesh,
      geomorph: this.buildGeomorphState(coordinate, geometry)
    };
  }

  private buildGeomorphState(
    coordinate: TileCoordinate,
    geometry: BufferGeometry
  ): TerrainGeomorphState | null {
    if (coordinate.z === 0) {
      return null;
    }

    if (this.meshSegments <= 0) {
      return null;
    }

    const targetPositions = copyGeometryPositions(geometry);

    if (!targetPositions) {
      return null;
    }

    const gridSize = this.meshSegments + 1;
    const expectedSurfaceVertexCount = gridSize * gridSize;
    const surfaceVertexCount = resolveSurfaceVertexCount(geometry);

    if (surfaceVertexCount !== expectedSurfaceVertexCount) {
      return null;
    }

    const parentCoordinate = getParentCoordinate(coordinate);
    const parentKey = tileCoordinateKey(parentCoordinate);
    const parentGeometry = this.activeTiles.get(parentKey)?.mesh?.geometry;

    if (!parentGeometry) {
      return null;
    }

    const parentSurfaceVertexCount = resolveSurfaceVertexCount(parentGeometry);

    if (parentSurfaceVertexCount !== expectedSurfaceVertexCount) {
      return null;
    }

    const parentPositions = copyGeometryPositions(parentGeometry);

    if (!parentPositions) {
      return null;
    }

    const basePositions = new Float32Array(targetPositions);
    const quadrantX = coordinate.x % 2;
    const quadrantY = coordinate.y % 2;
    let hasDifference = false;

    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const u = column / this.meshSegments;
        const v = row / this.meshSegments;
        const parentU = (quadrantX + u) * 0.5;
        const parentV = (quadrantY + v) * 0.5;
        const [sampleX, sampleY, sampleZ] = sampleSurfacePosition(parentPositions, gridSize, parentU, parentV);
        const offset = (row * gridSize + column) * 3;

        basePositions[offset] = sampleX;
        basePositions[offset + 1] = sampleY;
        basePositions[offset + 2] = sampleZ;

        if (!hasDifference) {
          hasDifference =
            Math.abs(sampleX - targetPositions[offset]) > TERRAIN_GEOMORPH_EPSILON ||
            Math.abs(sampleY - targetPositions[offset + 1]) > TERRAIN_GEOMORPH_EPSILON ||
            Math.abs(sampleZ - targetPositions[offset + 2]) > TERRAIN_GEOMORPH_EPSILON;
        }
      }
    }

    if (!hasDifference) {
      return null;
    }

    return {
      basePositions,
      targetPositions,
      currentFactor: 0,
      targetFactor: 1
    };
  }

  private async loadElevationWithRecovery(
    tileKey: string,
    coordinate: TileCoordinate
  ): Promise<ElevationTileData | null> {
    const recoveryConfig = this.cachedElevationRecoveryConfig ?? (
      this.cachedElevationRecoveryConfig = resolveElevationRecoveryConfig(this.context, this.id, undefined)
    );
    const attempts = recoveryConfig.attempts;
    const delayMs = recoveryConfig.delayMs;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        return await this.elevationScheduler.request(tileKey, coordinate);
      } catch (error) {
        if (isTileRequestAbort(error)) {
          throw error;
        }

        lastError = error;

        if (attempt < attempts) {
          if (delayMs > 0) {
            await sleep(delayMs);
          } else {
            await new Promise<void>((resolve) => {
              queueMicrotask(resolve);
            });
          }
          continue;
        }

        break;
      }
    }

    this.emitLayerError(this.context, {
      stage: "tile-load",
      category: "network",
      severity: "warn",
      error: lastError,
      recoverable: true,
      tileKey,
      metadata: { coordinate, attempts: attempts + 1 }
    });

    return null;
  }

  private removeTile(key: string): boolean {
    const entry = this.activeTiles.get(key);

    if (!entry) {
      return false;
    }

    this.elevationScheduler.cancel(key);

    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }

    this.activeTiles.delete(key);
    return true;
  }

  private clearActiveTiles(): boolean {
    let removedAny = false;

    for (const key of [...this.activeTiles.keys()]) {
      removedAny = this.removeTile(key) || removedAny;
    }

    return removedAny;
  }

  private invalidateRender(): void {
    if (this.renderInvalidationQueued) {
      return;
    }

    this.renderInvalidationQueued = true;
    queueMicrotask(() => {
      this.renderInvalidationQueued = false;
      this.context?.requestRender?.();
    });
  }
}
