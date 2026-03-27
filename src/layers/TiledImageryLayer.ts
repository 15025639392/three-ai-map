import { CanvasTexture, Texture } from "three";
import { Layer, LayerContext } from "./Layer";
import { TileCache } from "../tiles/TileCache";
import { TileScheduler } from "../tiles/TileScheduler";

type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

interface TiledImageryLayerOptions {
  zoom?: number;
  tileSize?: number;
  cacheSize?: number;
  concurrency?: number;
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
  private readonly zoom: number;
  private readonly tileSize: number;
  private readonly templateUrl: string;
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly mercatorCanvas: HTMLCanvasElement;
  private readonly outputCanvas: HTMLCanvasElement;
  private readonly texture: Texture;
  private readonly readyPromise: Promise<void>;
  private context: LayerContext | null = null;

  constructor(id: string, options: TiledImageryLayerOptions = {}) {
    super(id);
    this.zoom = options.zoom ?? 2;
    this.tileSize = options.tileSize ?? 128;
    this.templateUrl = options.templateUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    this.cache = new TileCache<TileSource>(options.cacheSize ?? 32);
    const tileLoader =
      options.loadTile ?? ((coordinate: TileCoordinate) => defaultTileLoader(coordinate, this.templateUrl));
    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 4,
      loadTile: tileLoader
    });
    const worldTileCount = 2 ** this.zoom;
    this.mercatorCanvas = document.createElement("canvas");
    this.mercatorCanvas.width = worldTileCount * this.tileSize;
    this.mercatorCanvas.height = worldTileCount * this.tileSize;
    this.outputCanvas = document.createElement("canvas");
    this.outputCanvas.width = this.mercatorCanvas.width;
    this.outputCanvas.height = this.mercatorCanvas.width / 2;
    this.paintPlaceholder();
    this.texture = new CanvasTexture(this.outputCanvas);
    this.readyPromise = this.loadGlobalTiles();
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.globe.setTexture(this.texture);
    this.readyPromise.then(() => {
      context.requestRender?.();
    }).catch(() => {
      context.requestRender?.();
    });
  }

  onRemove(context: LayerContext): void {
    context.globe.setTexture(null);
    this.context = null;
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  dispose(): void {
    this.cache.clear();
    this.scheduler.clear();
    this.texture.dispose();
  }

  private async loadGlobalTiles(): Promise<void> {
    const worldTileCount = 2 ** this.zoom;
    const tasks: Promise<void>[] = [];

    for (let y = 0; y < worldTileCount; y += 1) {
      for (let x = 0; x < worldTileCount; x += 1) {
        tasks.push(this.loadAndDrawTile({ z: this.zoom, x, y }));
      }
    }

    await Promise.all(tasks);
    this.projectMercatorToEquirectangular();
    this.texture.needsUpdate = true;
  }

  private async loadAndDrawTile(coordinate: TileCoordinate): Promise<void> {
    const key = `${coordinate.z}/${coordinate.x}/${coordinate.y}`;
    let tile = this.cache.get(key);

    if (!tile) {
      tile = await this.scheduler.request(key, coordinate);
      this.cache.set(key, tile);
    }

    const context = this.mercatorCanvas.getContext("2d");

    if (!context) {
      throw new Error("Mercator canvas context is not available");
    }

    context.drawImage(
      tile,
      coordinate.x * this.tileSize,
      coordinate.y * this.tileSize,
      this.tileSize,
      this.tileSize
    );

    this.projectMercatorToEquirectangular();
    this.texture.needsUpdate = true;
    this.context?.requestRender?.();
  }

  private projectMercatorToEquirectangular(): void {
    const outputContext = this.outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Output canvas context is not available");
    }

    outputContext.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);

    for (let y = 0; y < this.outputCanvas.height; y += 1) {
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
