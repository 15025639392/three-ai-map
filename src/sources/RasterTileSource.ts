import { TileCache } from "../tiles/TileCache";
import { TileScheduler, type TileRequestOptions } from "../tiles/TileScheduler";
import type { TileCoordinate } from "../tiles/TileViewport";
import { defaultTileLoader, type TileSource } from "../tiles/tileLoader";
import { pickTileTemplate } from "../tiles/TileUrlPicker";
import type { Source, SourceContext } from "./Source";

export interface RasterTileSourceOptions {
  tiles: string[];
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  cache?: number;
  concurrency?: number;
  schedulerMaxQueue?: number;
  schedulerAgingFactor?: number;
  loadTile?: (coordinate: TileCoordinate, signal?: AbortSignal) => Promise<TileSource>;
}

function tileKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
}

export class RasterTileSource implements Source {
  readonly id: string;
  readonly tileSize: number;
  readonly minZoom: number;
  readonly maxZoom: number;

  private readonly templates: string[];
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private context: SourceContext | null = null;

  constructor(id: string, options: RasterTileSourceOptions) {
    this.id = id;
    this.templates = options.tiles;
    this.tileSize = options.tileSize ?? 256;
    this.minZoom = options.minZoom ?? 0;
    this.maxZoom = options.maxZoom ?? 22;
    this.cache = new TileCache<TileSource>(options.cache ?? 96, {
      onEvict: (_key, source) => {
        if (source instanceof HTMLCanvasElement) {
          source.width = 0;
          source.height = 0;
        } else if ("close" in source) {
          (source as ImageBitmap).close();
        }
      }
    });

    const loadTile =
      options.loadTile ??
      ((coordinate: TileCoordinate, signal?: AbortSignal) =>
        defaultTileLoader(coordinate, pickTileTemplate(this.templates, coordinate), signal));

    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 6,
      maxQueueSize: options.schedulerMaxQueue ?? Math.max(192, (options.concurrency ?? 6) * 96),
      agingFactor: options.schedulerAgingFactor ?? 12,
      loadTile
    });
  }

  onAdd(context: SourceContext): void {
    this.context = context;
  }

  onRemove(): void {
    this.context = null;
  }

  request(coordinate: TileCoordinate, options?: TileRequestOptions): Promise<TileSource> {
    const key = tileKey(coordinate);
    const cached = this.cache.get(key);

    if (cached) {
      return Promise.resolve(cached);
    }

    return this.scheduler.request(key, coordinate, options)
      .then((tile) => {
        this.cache.set(key, tile);
        return tile;
      })
      .finally(() => {
        this.context?.requestRender?.();
      });
  }

  cancel(coordinateOrKey: TileCoordinate | string): boolean {
    const key = typeof coordinateOrKey === "string" ? coordinateOrKey : tileKey(coordinateOrKey);
    return this.scheduler.cancel(key);
  }

  getStats(): ReturnType<TileScheduler<TileSource, TileCoordinate>["getStats"]> {
    return this.scheduler.getStats();
  }

  dispose(): void {
    this.scheduler.clear();
    this.cache.clear();
  }
}
