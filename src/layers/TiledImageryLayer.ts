import { CanvasTexture, Texture } from "three";
import { Layer, LayerContext } from "./Layer";
import { TileCache } from "../tiles/TileCache";
import { TileScheduler } from "../tiles/TileScheduler";
import {
  TileCoordinate,
  computeTargetZoom,
  computeVisibleTileCoordinates
} from "../tiles/TileViewport";

type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

interface TiledImageryLayerOptions {
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  cacheSize?: number;
  concurrency?: number;
  projectionRowsPerFrame?: number;
  templateUrl?: string;
  loadTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
}

function mercatorYFromLatitude(latitude: number, height: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return (
    (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * height
  );
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

export class TiledImageryLayer extends Layer {
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly tileSize: number;
  private readonly projectionRowsPerFrame: number;
  private readonly templateUrl: string;
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly mercatorCanvas: HTMLCanvasElement;
  private readonly outputCanvas: HTMLCanvasElement;
  private readonly texture: Texture;
  private readonly drawnTileKeys = new Set<string>();
  private context: LayerContext | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private currentViewKey = "";
  private projectionFrameId: number | null = null;
  private projectionDirty = false;
  private projectionRow = 0;
  private readonly projectionResolvers: Array<() => void> = [];

  constructor(id: string, options: TiledImageryLayerOptions = {}) {
    super(id);
    this.minZoom = options.minZoom ?? 1;
    this.maxZoom = options.maxZoom ?? 5;
    this.tileSize = options.tileSize ?? 128;
    this.projectionRowsPerFrame = options.projectionRowsPerFrame ?? 256;
    this.templateUrl = options.templateUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    this.cache = new TileCache<TileSource>(options.cacheSize ?? 64);
    const tileLoader =
      options.loadTile ?? ((coordinate: TileCoordinate) => defaultTileLoader(coordinate, this.templateUrl));
    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 4,
      loadTile: tileLoader
    });

    const maxWorldTileCount = 2 ** this.maxZoom;
    this.mercatorCanvas = document.createElement("canvas");
    this.mercatorCanvas.width = maxWorldTileCount * this.tileSize;
    this.mercatorCanvas.height = maxWorldTileCount * this.tileSize;
    this.outputCanvas = document.createElement("canvas");
    this.outputCanvas.width = this.mercatorCanvas.width;
    this.outputCanvas.height = this.mercatorCanvas.width / 2;
    this.paintPlaceholder();
    this.texture = new CanvasTexture(this.outputCanvas);
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.globe.setTexture(this.texture);
    this.syncVisibleTiles(context);
  }

  onRemove(context: LayerContext): void {
    context.globe.setTexture(null);
    this.context = null;
    this.currentViewKey = "";
  }

  update(_deltaTime: number, context: LayerContext): void {
    this.syncVisibleTiles(context);
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  dispose(): void {
    this.cache.clear();
    this.scheduler.clear();
    this.texture.dispose();

    if (this.projectionFrameId !== null) {
      window.cancelAnimationFrame(this.projectionFrameId);
      this.projectionFrameId = null;
    }
  }

  private syncVisibleTiles(context: LayerContext): void {
    const viewportWidth =
      context.rendererElement?.clientWidth || context.rendererElement?.width || 1;
    const viewportHeight =
      context.rendererElement?.clientHeight || context.rendererElement?.height || 1;
    const zoom = computeTargetZoom({
      camera: context.camera,
      viewportWidth,
      viewportHeight,
      radius: context.radius,
      tileSize: this.tileSize,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom
    });
    const visibleTiles = computeVisibleTileCoordinates({
      camera: context.camera,
      viewportWidth,
      viewportHeight,
      radius: context.radius,
      zoom
    });
    const nextViewKey = visibleTiles
      .map((coordinate) => `${coordinate.z}/${coordinate.x}/${coordinate.y}`)
      .sort()
      .join("|");

    if (!nextViewKey || nextViewKey === this.currentViewKey) {
      return;
    }

    this.currentViewKey = nextViewKey;
    this.readyPromise = Promise.all(visibleTiles.map((coordinate) => this.loadAndDrawTile(coordinate)))
      .then(() => this.flushProjection())
      .then(() => undefined);
  }

  private async loadAndDrawTile(coordinate: TileCoordinate): Promise<void> {
    const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;

    if (this.drawnTileKeys.has(key)) {
      return;
    }

    let tile = this.cache.get(key);

    if (!tile) {
      tile = await this.scheduler.request(key, coordinate);
      this.cache.set(key, tile);
    }

    this.drawTileToMercator(tile, coordinate);
    this.drawnTileKeys.add(key);
    this.scheduleProjection();
  }

  private drawTileToMercator(tile: TileSource, coordinate: TileCoordinate): void {
    const context = this.mercatorCanvas.getContext("2d");

    if (!context) {
      throw new Error("Mercator canvas context is not available");
    }

    const scale = 2 ** (this.maxZoom - coordinate.z);
    const targetSize = this.tileSize * scale;

    context.drawImage(
      tile,
      coordinate.x * targetSize,
      coordinate.y * targetSize,
      targetSize,
      targetSize
    );
  }

  private projectMercatorToEquirectangular(startRow: number, endRow: number): void {
    const outputContext = this.outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Output canvas context is not available");
    }

    for (let y = startRow; y < endRow; y += 1) {
      const latitude = 90 - ((y + 0.5) / this.outputCanvas.height) * 180;
      const sourceY = mercatorYFromLatitude(latitude, this.mercatorCanvas.height);

      outputContext.drawImage(
        this.mercatorCanvas,
        0,
        sourceY,
        this.mercatorCanvas.width,
        1,
        0,
        y,
        this.outputCanvas.width,
        1
      );
    }
  }

  private scheduleProjection(): void {
    this.projectionDirty = true;
    this.requestProjectionFrame();
  }

  private requestProjectionFrame(): void {
    if (this.projectionFrameId !== null) {
      return;
    }

    this.projectionFrameId = window.requestAnimationFrame(() => {
      this.projectionFrameId = null;
      const outputContext = this.outputCanvas.getContext("2d");

      if (!outputContext) {
        throw new Error("Output canvas context is not available");
      }

      if (this.projectionDirty) {
        this.projectionDirty = false;
        this.projectionRow = 0;
        outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
      }

      const endRow = Math.min(
        this.outputCanvas.height,
        this.projectionRow + this.projectionRowsPerFrame
      );
      this.projectMercatorToEquirectangular(this.projectionRow, endRow);
      this.projectionRow = endRow;

      if (this.projectionDirty || this.projectionRow < this.outputCanvas.height) {
        this.requestProjectionFrame();
        return;
      }

      this.texture.needsUpdate = true;
      this.context?.requestRender?.();
      this.resolveProjectionPromises();
    });
  }

  private flushProjection(): Promise<void> {
    if (!this.projectionDirty && this.projectionFrameId === null) {
      return Promise.resolve();
    }

    if (this.projectionDirty && this.projectionFrameId === null) {
      this.requestProjectionFrame();
    }

    return new Promise<void>((resolve) => {
      this.projectionResolvers.push(resolve);
    });
  }

  private resolveProjectionPromises(): void {
    while (this.projectionResolvers.length > 0) {
      const resolve = this.projectionResolvers.shift();
      resolve?.();
    }
  }

  private paintPlaceholder(): void {
    const context = this.outputCanvas.getContext("2d");

    if (!context) {
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 0, this.outputCanvas.height);
    gradient.addColorStop(0, "#173764");
    gradient.addColorStop(0.55, "#0d2040");
    gradient.addColorStop(1, "#081327");
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
  }
}
