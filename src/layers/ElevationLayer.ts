import { Layer, LayerContext } from "./Layer";
import { TileCache } from "../tiles/TileCache";
import { TileScheduler } from "../tiles/TileScheduler";
import { TileCoordinate } from "../tiles/TileViewport";
import { ElevationSampler } from "../globe/GlobeMesh";

type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

interface ElevationLayerOptions {
  zoom?: number;
  tileSize?: number;
  cacheSize?: number;
  concurrency?: number;
  exaggeration?: number;
  templateUrl?: string;
  loadTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
}

function decodeTerrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
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
    throw new Error(`Failed to load elevation tile ${url}`);
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

export class ElevationLayer extends Layer {
  private readonly zoom: number;
  private readonly tileSize: number;
  private readonly exaggeration: number;
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly canvas: HTMLCanvasElement;
  private context: LayerContext | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(id: string, options: ElevationLayerOptions = {}) {
    super(id);
    this.zoom = options.zoom ?? 3;
    this.tileSize = options.tileSize ?? 256;
    this.exaggeration = options.exaggeration ?? 1.2;
    this.cache = new TileCache<TileSource>(options.cacheSize ?? 32);
    const templateUrl =
      options.templateUrl ?? "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 4,
      loadTile: options.loadTile ?? ((coordinate: TileCoordinate) => defaultTileLoader(coordinate, templateUrl))
    });
    const worldTileCount = 2 ** this.zoom;
    this.canvas = document.createElement("canvas");
    this.canvas.width = worldTileCount * this.tileSize;
    this.canvas.height = worldTileCount * this.tileSize;
  }

  onAdd(context: LayerContext): void {
    this.context = context;

    if (!this.loadPromise) {
      this.loadPromise = this.loadGlobalElevation().then(() => {
        const sampler = this.createElevationSampler();
        context.globe.setElevationSampler(sampler, this.exaggeration);
        context.requestRender?.();
      });
    }
  }

  onRemove(context: LayerContext): void {
    context.globe.setElevationSampler(null);
    this.context = null;
  }

  async ready(): Promise<void> {
    await this.loadPromise;
  }

  dispose(): void {
    this.cache.clear();
    this.scheduler.clear();
  }

  private async loadGlobalElevation(): Promise<void> {
    const worldTileCount = 2 ** this.zoom;
    const tasks: Promise<void>[] = [];

    for (let y = 0; y < worldTileCount; y += 1) {
      for (let x = 0; x < worldTileCount; x += 1) {
        tasks.push(this.loadAndDrawTile({ z: this.zoom, x, y }));
      }
    }

    await Promise.all(tasks);
  }

  private async loadAndDrawTile(coordinate: TileCoordinate): Promise<void> {
    const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
    let tile = this.cache.get(key);

    if (!tile) {
      tile = await this.scheduler.request(key, coordinate);
      this.cache.set(key, tile);
    }

    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("Elevation canvas context is not available");
    }

    context.drawImage(
      tile,
      coordinate.x * this.tileSize,
      coordinate.y * this.tileSize,
      this.tileSize,
      this.tileSize
    );
  }

  private createElevationSampler(): ElevationSampler {
    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("Elevation canvas context is not available");
    }

    const imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const { data, width, height } = imageData;

    return (u: number, v: number): number => {
      const wrappedU = ((u % 1) + 1) % 1;
      const clampedV = Math.max(0, Math.min(1, v));
      const x = Math.min(width - 1, Math.floor(wrappedU * (width - 1)));
      const y = Math.min(height - 1, Math.floor((1 - clampedV) * (height - 1)));
      const offset = (y * width + x) * 4;

      return decodeTerrariumHeight(data[offset], data[offset + 1], data[offset + 2]);
    };
  }
}
