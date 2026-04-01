import type { LngLatBounds } from "../tiles/LngLatBounds";
import { shouldRequestDemForCoordinate } from "../tiles/LngLatBounds";
import { TileCache } from "../tiles/TileCache";
import { TerrariumDecoder, type TerrariumDecoderStats } from "../tiles/TerrariumDecoder";
import { TileScheduler, type TileRequestOptions, type TileSchedulerStats } from "../tiles/TileScheduler";
import { corsTileLoader } from "../tiles/tileLoader";
import type { TileCoordinate } from "../tiles/TileViewport";
import { pickTileTemplate } from "../tiles/TileUrlPicker";
import type { ElevationEncoding } from "../tiles/ElevationEncoding";
import type { Source, SourceContext } from "./Source";

export interface ElevationTileData {
  width: number;
  height: number;
  data: Float32Array;
}

export interface TerrainTileSourceOptions {
  tiles: string[];
  encode: ElevationEncoding;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  cache?: number;
  extraBounds?: LngLatBounds[];
  concurrency?: number;
  schedulerMaxQueue?: number;
  schedulerAgingFactor?: number;
  loadTile?: (coordinate: TileCoordinate, signal?: AbortSignal) => Promise<ElevationTileData>;
}

function tileKey(coordinate: TileCoordinate): string {
  return `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
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

export class TerrainTileSource implements Source {
  readonly id: string;
  readonly tileSize: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly extraBounds: LngLatBounds[] | undefined;

  private readonly templates: string[];
  private readonly decoder = new TerrariumDecoder();
  private readonly cache: TileCache<ElevationTileData>;
  private readonly scheduler: TileScheduler<ElevationTileData, TileCoordinate>;
  private context: SourceContext | null = null;

  constructor(id: string, options: TerrainTileSourceOptions) {
    this.id = id;
    this.templates = options.tiles;
    this.tileSize = options.tileSize ?? 256;
    this.minZoom = options.minZoom ?? 1;
    this.maxZoom = options.maxZoom ?? 8;
    this.extraBounds = options.extraBounds;
    this.cache = new TileCache<ElevationTileData>(options.cache ?? 96);

    const loadTile =
      options.loadTile ??
      ((coordinate: TileCoordinate, signal?: AbortSignal) =>
        defaultElevationLoader(
          coordinate,
          pickTileTemplate(this.templates, coordinate),
          this.decoder,
          options.encode,
          signal
        ));

    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 6,
      maxQueueSize: options.schedulerMaxQueue ?? Math.max(96, (options.concurrency ?? 6) * 64),
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

  request(
    coordinate: TileCoordinate,
    options?: TileRequestOptions
  ): Promise<ElevationTileData | null> {
    if (!shouldRequestDemForCoordinate(coordinate, this.extraBounds)) {
      return Promise.resolve(null);
    }

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

  getStats(): TileSchedulerStats {
    return this.scheduler.getStats();
  }

  getDecodeStats(): TerrariumDecoderStats {
    return this.decoder.getStats();
  }

  dispose(): void {
    this.scheduler.clear();
    this.cache.clear();
    this.decoder.dispose();
  }
}
