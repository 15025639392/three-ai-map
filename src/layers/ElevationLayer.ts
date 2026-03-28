import { Layer, LayerContext } from "./Layer";
import { TileCache } from "../tiles/TileCache";
import { TileScheduler } from "../tiles/TileScheduler";
import { TileCoordinate } from "../tiles/TileViewport";
import { defaultTileLoader, type TileSource } from "../tiles/tileLoader";
import { ElevationSampler } from "../globe/GlobeMesh";
import { TerrariumDecoder } from "../tiles/TerrariumDecoder";

interface ElevationLayerOptions {
  zoom?: number;
  tileSize?: number;
  cacheSize?: number;
  concurrency?: number;
  exaggeration?: number;
  templateUrl?: string;
  loadTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
}

export class ElevationLayer extends Layer {
  private readonly zoom: number;
  private readonly tileSize: number;
  private readonly exaggeration: number;
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly canvas: HTMLCanvasElement;
  private readonly terrariumDecoder = new TerrariumDecoder();
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
        return this.createElevationSampler().then((sampler) => {
          context.globe.setElevationSampler(sampler, this.exaggeration);
          context.requestRender?.();
        });
      });
    }
  }

  onRemove(context: LayerContext): void {
    context.globe.setElevationSampler(null);
    this.context = null;
    this.loadPromise = null;
  }

  async ready(): Promise<void> {
    await this.loadPromise;
  }

  dispose(): void {
    this.cache.clear();
    this.scheduler.clear();
    this.terrariumDecoder.dispose();
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

  private async createElevationSampler(): Promise<ElevationSampler> {
    const context = this.canvas.getContext("2d");

    if (!context) {
      throw new Error("Elevation canvas context is not available");
    }

    const imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const { data } = imageData;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const heights = await this.terrariumDecoder.decode(width, height, data);

    return (u: number, v: number): number => {
      const wrappedU = ((u % 1) + 1) % 1;
      const clampedV = Math.max(0, Math.min(1, v));
      const fx = wrappedU * (width - 1);
      const fy = (1 - clampedV) * (height - 1);
      const x0 = Math.min(width - 2, Math.max(0, Math.floor(fx)));
      const y0 = Math.min(height - 2, Math.max(0, Math.floor(fy)));
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const tx = fx - x0;
      const ty = fy - y0;
      const topLeft = heights[y0 * width + x0];
      const topRight = heights[y0 * width + x1];
      const bottomLeft = heights[y1 * width + x0];
      const bottomRight = heights[y1 * width + x1];
      const top = topLeft * (1 - tx) + topRight * tx;
      const bottom = bottomLeft * (1 - tx) + bottomRight * tx;
      return top * (1 - ty) + bottom * ty;
    };
  }
}
