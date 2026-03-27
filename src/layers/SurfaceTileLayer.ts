import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture
} from "three";
import { WGS84_RADIUS } from "../geo/ellipsoid";
import { cartographicToCartesian } from "../geo/projection";
import { TileCache } from "../tiles/TileCache";
import { TileScheduler } from "../tiles/TileScheduler";
import {
  selectSurfaceTileCoordinates,
  getSurfaceTileBounds,
  SurfaceTileSelection,
  SurfaceTileSelectionOptions
} from "../tiles/SurfaceTileTree";
import { TileCoordinate } from "../tiles/TileViewport";
import { Layer, LayerContext } from "./Layer";

type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

export interface ElevationTileData {
  width: number;
  height: number;
  data: Float32Array;
}

interface SurfaceTileEntry {
  promise: Promise<void>;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
}

class StaleSurfaceTileError extends Error {
  constructor() {
    super("Surface tile entry is no longer current");
  }
}

interface SurfaceTileLayerOptions {
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  meshSegments?: number;
  cacheSize?: number;
  concurrency?: number;
  elevationExaggeration?: number;
  zoomExaggerationBoost?: number;
  imageryTemplateUrl?: string;
  elevationTemplateUrl?: string;
  selectTiles?: (options: SurfaceTileSelectionOptions) => SurfaceTileSelection;
  loadImageryTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
  loadElevationTile?: (coordinate: TileCoordinate) => Promise<ElevationTileData>;
}

function createTexture(source: TileSource): Texture {
  if (source instanceof HTMLCanvasElement) {
    const texture = new CanvasTexture(source);
    texture.needsUpdate = true;
    return texture;
  }

  const texture = new Texture(source as Exclude<TileSource, HTMLCanvasElement>);
  texture.needsUpdate = true;
  return texture;
}

async function defaultTileLoader(
  coordinate: TileCoordinate,
  templateUrl: string
): Promise<TileSource> {
  const url = templateUrl
    .replace("{z}", `${coordinate.z}`)
    .replace("{x}", `${coordinate.x}`)
    .replace("{y}", `${coordinate.y}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load tile ${url}`);
  }

  const blob = await response.blob();

  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    image.src = objectUrl;
  });
}

async function defaultElevationLoader(
  coordinate: TileCoordinate,
  templateUrl: string
): Promise<ElevationTileData> {
  const source = await defaultTileLoader(coordinate, templateUrl);
  const canvas = document.createElement("canvas");
  canvas.width = "width" in source ? source.width : 256;
  canvas.height = "height" in source ? source.height : 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Elevation decode canvas context is not available");
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const heights = new Float32Array(canvas.width * canvas.height);

  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    heights[index] =
      imageData.data[offset] * 256 +
      imageData.data[offset + 1] +
      imageData.data[offset + 2] / 256 -
      32768;
  }

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

function buildSurfaceTileGeometry(
  coordinate: TileCoordinate,
  radius: number,
  meshSegments: number,
  elevationTile: ElevationTileData | null,
  elevationExaggeration: number
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
      const heightMeters = elevationTile ? sampleElevation(elevationTile, u, v) : 0;
      const height = (heightMeters / WGS84_RADIUS) * radius * elevationExaggeration;
      const cartesian = cartographicToCartesian(
        {
          lng,
          lat,
          height
        },
        radius
      );

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

export class SurfaceTileLayer extends Layer {
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly tileSize: number;
  private readonly meshSegments: number;
  private readonly elevationExaggeration: number;
  private readonly zoomExaggerationBoost: number;
  private readonly selectTiles;
  private readonly imageryCache: TileCache<TileSource>;
  private readonly elevationCache: TileCache<ElevationTileData>;
  private readonly imageryScheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly elevationScheduler: TileScheduler<ElevationTileData, TileCoordinate>;
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, SurfaceTileEntry>();
  private context: LayerContext | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private currentSelectionKey = "";
  private renderInvalidationQueued = false;

  constructor(id: string, options: SurfaceTileLayerOptions = {}) {
    super(id);
    this.minZoom = options.minZoom ?? 1;
    this.maxZoom = options.maxZoom ?? 8;
    this.tileSize = options.tileSize ?? 256;
    this.meshSegments = options.meshSegments ?? 16;
    this.elevationExaggeration = options.elevationExaggeration ?? 1.15;
    this.zoomExaggerationBoost = options.zoomExaggerationBoost ?? 0;
    this.selectTiles = options.selectTiles ?? selectSurfaceTileCoordinates;
    this.imageryCache = new TileCache<TileSource>(options.cacheSize ?? 96);
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
        ((coordinate: TileCoordinate) => defaultElevationLoader(coordinate, elevationTemplateUrl))
    });
    this.group.name = id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);
    this.syncTiles(context);
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
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
  }

  private syncTiles(context: LayerContext): void {
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
      .map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
      .sort()
      .join("|");
    const selectionResolved = selection.coordinates.every((coordinate) =>
      this.activeTiles.has(`${coordinate.z}/${coordinate.x}/${coordinate.y}`)
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
      selection.coordinates.map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
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
        this.ensureTile(coordinate, context.radius, selection.zoom)
      )
    ).then(() => undefined);
  }

  private ensureTile(coordinate: TileCoordinate, radius: number, selectionZoom: number): Promise<void> {
    const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
    const existing = this.activeTiles.get(key);

    if (existing) {
      return existing.promise;
    }

    const entry: SurfaceTileEntry = {
      mesh: null,
      promise: this.loadTileMesh(
        coordinate,
        radius,
        this.computeElevationExaggeration(selectionZoom),
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

        if (this.activeTiles.get(key) === entry) {
          this.activeTiles.delete(key);
        }

        throw error;
      })
    };
    this.activeTiles.set(key, entry);
    return entry.promise;
  }

  private async loadTileMesh(
    coordinate: TileCoordinate,
    radius: number,
    elevationExaggeration: number,
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
      elevationExaggeration
    );
    const texture = createTexture(imagery);
    const material = new MeshStandardMaterial({
      map: texture,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    if (!isCurrent()) {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      throw new StaleSurfaceTileError();
    }

    const mesh = new Mesh(geometry, material);
    mesh.name = key;
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
