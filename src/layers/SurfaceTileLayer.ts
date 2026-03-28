import {
  BufferGeometry,
  ClampToEdgeWrapping,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Texture
} from "three";
import { WGS84_RADIUS } from "../geo/ellipsoid";
import { cartographicToCartesian } from "../geo/projection";
import { TileCache } from "../tiles/TileCache";
import { TerrariumDecoder } from "../tiles/TerrariumDecoder";
import { TileScheduler } from "../tiles/TileScheduler";
import { defaultTileLoader, corsTileLoader, type TileSource } from "../tiles/tileLoader";
import {
  selectSurfaceTileCoordinates,
  getSurfaceTileBounds,
  SurfaceTileSelection,
  SurfaceTileSelectionOptions
} from "../tiles/SurfaceTileTree";
import { TileCoordinate } from "../tiles/TileViewport";
import { Layer, LayerContext } from "./Layer";

export interface ElevationTileData {
  width: number;
  height: number;
  data: Float32Array;
}

interface SurfaceTileEntry {
  promise: Promise<void>;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  skirtMaskKey: string;
}

class StaleSurfaceTileError extends Error {
  constructor() {
    super("Surface tile entry is no longer current");
  }
}

export interface CoordTransformFn {
  (lng: number, lat: number): { lng: number; lat: number };
}

export interface SurfaceTileLayerOptions {
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  meshSegments?: number;
  cacheSize?: number;
  concurrency?: number;
  elevationExaggeration?: number;
  zoomExaggerationBoost?: number;
  skirtDepthMeters?: number;
  textureUvInsetPixels?: number;
  imageryTemplateUrl?: string;
  elevationTemplateUrl?: string;
  selectTiles?: (options: SurfaceTileSelectionOptions) => SurfaceTileSelection;
  loadImageryTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
  loadElevationTile?: (coordinate: TileCoordinate) => Promise<ElevationTileData>;
  coordTransform?: CoordTransformFn;
}

interface TileSkirtMask {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
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

function getTileSourceSize(source: TileSource): { width: number; height: number } {
  return {
    width: "width" in source ? source.width : 256,
    height: "height" in source ? source.height : 256
  };
}

function computeTextureUvInset(source: TileSource, insetPixels: number): number {
  if (insetPixels <= 0) {
    return 0;
  }

  const { width, height } = getTileSourceSize(source);
  const minDimension = Math.min(width, height);

  if (!Number.isFinite(minDimension) || minDimension <= 1) {
    return 0;
  }

  return Math.min(0.25, insetPixels / minDimension);
}

function tileCoordinateKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

function normalizeTileX(x: number, zoom: number): number {
  const worldTileCount = 2 ** zoom;
  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function createDefaultSkirtMask(): TileSkirtMask {
  return {
    top: true,
    right: true,
    bottom: true,
    left: true
  };
}

function encodeSkirtMask(mask: TileSkirtMask): string {
  return `${mask.top ? 1 : 0}${mask.right ? 1 : 0}${mask.bottom ? 1 : 0}${mask.left ? 1 : 0}`;
}

function computeTileSkirtMasks(coordinates: TileCoordinate[]): Map<string, TileSkirtMask> {
  const keySet = new Set(coordinates.map((coordinate) => tileCoordinateKey(coordinate)));
  const masks = new Map<string, TileSkirtMask>();

  for (const coordinate of coordinates) {
    const worldTileCount = 2 ** coordinate.z;
    const key = tileCoordinateKey(coordinate);
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

async function defaultElevationLoader(
  coordinate: TileCoordinate,
  templateUrl: string,
  decoder: TerrariumDecoder
): Promise<ElevationTileData> {
  const source = await corsTileLoader(coordinate, templateUrl);
  const canvas = document.createElement("canvas");
  canvas.width = "width" in source ? source.width : 256;
  canvas.height = "height" in source ? source.height : 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Elevation decode canvas context is not available");
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const heights = await decoder.decode(canvas.width, canvas.height, imageData.data);

  return {
    width: canvas.width,
    height: canvas.height,
    data: heights
  };
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
    indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
  }
}

function buildSurfaceTileGeometry(
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
      const TILE_DEPTH_OFFSET = 0.001; // Geometric offset to avoid z-fighting
      const height = (heightMeters / WGS84_RADIUS) * radius * elevationExaggeration + TILE_DEPTH_OFFSET;

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
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
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
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class SurfaceTileLayer extends Layer {
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly tileSize: number;
  private readonly meshSegments: number;
  private readonly skirtDepthMeters: number;
  private readonly textureUvInsetPixels: number;
  private readonly elevationExaggeration: number;
  private readonly zoomExaggerationBoost: number;
  private readonly coordTransform?: CoordTransformFn;
  private readonly selectTiles;
  private readonly imageryCache: TileCache<TileSource>;
  private readonly elevationCache: TileCache<ElevationTileData>;
  private readonly imageryScheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly elevationScheduler: TileScheduler<ElevationTileData, TileCoordinate>;
  private readonly terrariumDecoder = new TerrariumDecoder();
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, SurfaceTileEntry>();
  private context: LayerContext | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private currentSelectionKey = "";
  private renderInvalidationQueued = false;
  private lastCameraMatrixHash = "";

  constructor(id: string, options: SurfaceTileLayerOptions = {}) {
    super(id);
    this.minZoom = options.minZoom ?? 1;
    this.maxZoom = options.maxZoom ?? 8;
    this.tileSize = options.tileSize ?? 256;
    this.meshSegments = options.meshSegments ?? 16;
    this.skirtDepthMeters = options.skirtDepthMeters ?? 900;
    this.textureUvInsetPixels = options.textureUvInsetPixels ?? 0.5;
    this.elevationExaggeration = options.elevationExaggeration ?? 1.15;
    this.zoomExaggerationBoost = options.zoomExaggerationBoost ?? 0;
    this.coordTransform = options.coordTransform;
    this.selectTiles = options.selectTiles ?? selectSurfaceTileCoordinates;
    this.imageryCache = new TileCache<TileSource>(options.cacheSize ?? 96, {
      onEvict: (_key, source) => {
        if (source instanceof HTMLCanvasElement) {
          source.width = 0;
          source.height = 0;
        } else if ("close" in source) {
          (source as ImageBitmap).close();
        }
      }
    });
    this.elevationCache = new TileCache<ElevationTileData>(options.cacheSize ?? 96);
    const imageryTemplateUrl =
      options.imageryTemplateUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    const elevationTemplateUrl =
      options.elevationTemplateUrl ??
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
    this.imageryScheduler = new TileScheduler({
      concurrency: options.concurrency ?? 6,
      loadTile:
        options.loadImageryTile ??
        ((coordinate: TileCoordinate) => defaultTileLoader(coordinate, imageryTemplateUrl))
    });
    this.elevationScheduler = new TileScheduler({
      concurrency: options.concurrency ?? 6,
      loadTile:
        options.loadElevationTile ??
        ((coordinate: TileCoordinate) =>
          defaultElevationLoader(coordinate, elevationTemplateUrl, this.terrariumDecoder))
    });
    this.group.name = id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.globe.mesh.visible = false;
    context.scene.add(this.group);
    this.syncTiles(context);
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    context.globe.mesh.visible = true;
    this.clearActiveTiles();
    this.context = null;
    this.currentSelectionKey = "";
  }

  update(_deltaTime: number, context: LayerContext): void {
    this.syncTiles(context);
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  getActiveTileKeys(): string[] {
    return [...this.activeTiles.keys()].sort();
  }

  dispose(): void {
    this.clearActiveTiles();
    this.imageryCache.clear();
    this.elevationCache.clear();
    this.imageryScheduler.clear();
    this.elevationScheduler.clear();
    this.terrariumDecoder.dispose();
  }

  private syncTiles(context: LayerContext): void {
    const cameraMatrix = context.camera.matrixWorld.elements;
    const cameraHash = cameraMatrix[12].toFixed(4) + cameraMatrix[13].toFixed(4) + cameraMatrix[14].toFixed(4);

    if (cameraHash === this.lastCameraMatrixHash && this.currentSelectionKey) {
      return;
    }

    this.lastCameraMatrixHash = cameraHash;
    const viewportWidth =
      context.rendererElement?.clientWidth || context.rendererElement?.width || 1;
    const viewportHeight =
      context.rendererElement?.clientHeight || context.rendererElement?.height || 1;
    const selection = this.selectTiles({
      camera: context.camera,
      viewportWidth,
      viewportHeight,
      radius: context.radius,
      tileSize: this.tileSize,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom
    });
    const selectionKey = selection.coordinates
      .map((coordinate) => tileCoordinateKey(coordinate))
      .sort()
      .join("|");
    const tileSkirtMasks = computeTileSkirtMasks(selection.coordinates);
    const selectionResolved = selection.coordinates.every((coordinate) =>
      this.activeTiles.get(tileCoordinateKey(coordinate))?.skirtMaskKey ===
      encodeSkirtMask(tileSkirtMasks.get(tileCoordinateKey(coordinate)) ?? createDefaultSkirtMask())
    );

    if (!selectionKey) {
      this.currentSelectionKey = "";
      const removedAny = this.clearActiveTiles();
      this.readyPromise = Promise.resolve();

      if (removedAny) {
        this.invalidateRender();
      }

      return;
    }

    if (selectionKey === this.currentSelectionKey && selectionResolved) {
      return;
    }

    this.currentSelectionKey = selectionKey;
    const nextKeys = new Set(
      selection.coordinates.map((coordinate) => tileCoordinateKey(coordinate))
    );

    let removedAny = false;

    for (const key of this.activeTiles.keys()) {
      if (!nextKeys.has(key)) {
        removedAny = this.removeTile(key) || removedAny;
      }
    }

    if (removedAny) {
      this.invalidateRender();
    }

    this.readyPromise = Promise.allSettled(
      selection.coordinates.map((coordinate) =>
        this.ensureTile(
          coordinate,
          context.radius,
          tileSkirtMasks.get(tileCoordinateKey(coordinate)) ?? createDefaultSkirtMask()
        )
      )
    ).then(() => undefined);
  }

  private ensureTile(coordinate: TileCoordinate, radius: number, skirtMask: TileSkirtMask): Promise<void> {
    const key = tileCoordinateKey(coordinate);
    const skirtMaskKey = encodeSkirtMask(skirtMask);
    const existing = this.activeTiles.get(key);

    if (existing && existing.skirtMaskKey === skirtMaskKey) {
      return existing.promise;
    }

    if (existing && existing.skirtMaskKey !== skirtMaskKey) {
      this.removeTile(key);
    }

    const entry: SurfaceTileEntry = {
      mesh: null,
      skirtMaskKey,
      promise: null!
    };
    this.activeTiles.set(key, entry);

    entry.promise = this.loadTileMesh(
      coordinate,
      radius,
      this.computeElevationExaggeration(coordinate.z),
      skirtMask,
      key,
      () => this.activeTiles.get(key) === entry
    ).then((mesh) => {
      const current = this.activeTiles.get(key);

      if (!current || current !== entry) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
        return;
      }

      entry.mesh = mesh;
      this.group.add(mesh);
      this.invalidateRender();
    }).catch((error) => {
      if (error instanceof StaleSurfaceTileError) {
        return;
      }

      console.error(`[SurfaceTileLayer] Failed to load tile ${key}:`, error);

      if (this.activeTiles.get(key) === entry) {
        this.activeTiles.delete(key);
      }

      throw error;
    });
    return entry.promise;
  }

  private async loadTileMesh(
    coordinate: TileCoordinate,
    radius: number,
    elevationExaggeration: number,
    skirtMask: TileSkirtMask,
    key: string,
    isCurrent: () => boolean
  ): Promise<Mesh<BufferGeometry, MeshStandardMaterial>> {
    let imagery = this.imageryCache.get(key);

    if (!imagery) {
      imagery = await this.imageryScheduler.request(key, coordinate);
      if (!isCurrent()) {
        throw new StaleSurfaceTileError();
      }
      this.imageryCache.set(key, imagery);
    }

    if (!isCurrent()) {
      throw new StaleSurfaceTileError();
    }

    let elevation = this.elevationCache.get(key);

    if (!elevation) {
      elevation = await this.elevationScheduler.request(key, coordinate);
      if (!isCurrent()) {
        throw new StaleSurfaceTileError();
      }
      this.elevationCache.set(key, elevation);
    }

    if (!isCurrent()) {
      throw new StaleSurfaceTileError();
    }

    const geometry = buildSurfaceTileGeometry(
      coordinate,
      radius,
      this.meshSegments,
      elevation,
      elevationExaggeration,
      this.skirtDepthMeters,
      computeTextureUvInset(imagery, this.textureUvInsetPixels),
      skirtMask,
      this.coordTransform
    );
    const texture = createTexture(imagery);
    const material = new MeshStandardMaterial({
      map: texture,
      depthTest: false, // Disable depth test to ensure visibility
    });

    if (!isCurrent()) {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      throw new StaleSurfaceTileError();
    }

    const mesh = new Mesh(geometry, material);
    mesh.name = key;
    mesh.renderOrder = 1; // Render after GlobeMesh
    return mesh;
  }

  private removeTile(key: string): boolean {
    const entry = this.activeTiles.get(key);

    if (!entry) {
      return false;
    }

    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.map?.dispose();
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
    Promise.resolve().then(() => {
      this.renderInvalidationQueued = false;
      this.context?.requestRender?.();
    });
  }

  private computeElevationExaggeration(zoom: number): number {
    if (this.zoomExaggerationBoost <= 0 || this.maxZoom <= this.minZoom) {
      return this.elevationExaggeration;
    }

    const normalizedZoom = Math.max(
      0,
      Math.min(1, (zoom - this.minZoom) / (this.maxZoom - this.minZoom))
    );
    return this.elevationExaggeration * (1 + normalizedZoom * this.zoomExaggerationBoost);
  }
}
