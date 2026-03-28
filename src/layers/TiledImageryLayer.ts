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
  maxCanvasDimension?: number;
  cacheSize?: number;
  concurrency?: number;
  projectionRowsPerFrame?: number;
  templateUrl?: string;
  loadTile?: (coordinate: TileCoordinate) => Promise<TileSource>;
}

interface ProjectionRowLookupWorkerRequest {
  id: number;
  outputHeight: number;
  mercatorHeight: number;
}

interface ProjectionRowLookupWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

const DEFAULT_MAX_CANVAS_DIMENSION = 4096;
const PROJECTION_PIXELS_PER_FRAME = 1024 * 1024;
const MIN_PROJECTION_ROWS_PER_FRAME = 32;
const MAX_PROJECTION_ROWS_PER_FRAME = 256;

function resolveMaxCanvasDimension(): number {
  if (typeof document === "undefined") {
    return DEFAULT_MAX_CANVAS_DIMENSION;
  }

  const probe = document.createElement("canvas");
  const webglCandidate = probe.getContext("webgl") ?? probe.getContext("experimental-webgl");
  const webglContext =
    webglCandidate && typeof (webglCandidate as { getParameter?: unknown }).getParameter === "function"
      ? (webglCandidate as WebGLRenderingContext)
      : null;

  if (!webglContext) {
    return DEFAULT_MAX_CANVAS_DIMENSION;
  }

  const maxTextureSize = Number(webglContext.getParameter(webglContext.MAX_TEXTURE_SIZE));

  if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
    return DEFAULT_MAX_CANVAS_DIMENSION;
  }

  return Math.floor(maxTextureSize);
}

function computeEffectiveMaxZoom(maxZoom: number, tileSize: number, maxCanvasDimension: number): number {
  const safeCanvasDimension = Math.max(tileSize, Math.floor(maxCanvasDimension));
  const maxWorldTileCount = Math.max(1, Math.floor(safeCanvasDimension / tileSize));
  const safeZoom = Math.max(0, Math.floor(Math.log2(maxWorldTileCount)));
  return Math.min(maxZoom, safeZoom);
}

function latitudeFromMercatorY(sourceY: number, height: number): number {
  const normalizedY = sourceY / height;
  const mercator = (0.5 - normalizedY) * (2 * Math.PI);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
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
  private readonly effectiveMaxZoom: number;
  private readonly tileSize: number;
  private readonly projectionRowsPerFrame: number;
  private readonly templateUrl: string;
  private readonly cache: TileCache<TileSource>;
  private readonly scheduler: TileScheduler<TileSource, TileCoordinate>;
  private readonly mercatorCanvas: HTMLCanvasElement;
  private readonly outputCanvas: HTMLCanvasElement;
  private readonly texture: Texture;
  private readonly drawnTileKeys = new Set<string>();
  private projectionSourceYLookup: Float32Array | null = null;
  private projectionSourceYLookupPromise: Promise<Float32Array> | null = null;
  private projectionLookupWorker: Worker | null = null;
  private projectionLookupRequestId = 0;
  private readonly projectionLookupPending = new Map<number, {
    resolve: (lookup: Float32Array) => void;
    reject: (reason?: unknown) => void;
  }>();
  private context: LayerContext | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private currentViewKey = "";
  private projectionFrameId: number | null = null;
  private hasProjectedOnce = false;
  private readonly dirtyProjectionRanges: Array<{ start: number; end: number }> = [];
  private activeProjectionRange: { start: number; end: number; cursor: number } | null = null;
  private readonly projectionResolvers: Array<() => void> = [];

  constructor(id: string, options: TiledImageryLayerOptions = {}) {
    super(id);
    this.minZoom = options.minZoom ?? 1;
    this.maxZoom = options.maxZoom ?? 5;
    this.tileSize = options.tileSize ?? 128;
    const maxCanvasDimension = options.maxCanvasDimension ?? resolveMaxCanvasDimension();
    this.effectiveMaxZoom = computeEffectiveMaxZoom(
      this.maxZoom,
      this.tileSize,
      maxCanvasDimension
    );
    this.templateUrl = options.templateUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    this.cache = new TileCache<TileSource>(options.cacheSize ?? 64);
    const tileLoader =
      options.loadTile ?? ((coordinate: TileCoordinate) => defaultTileLoader(coordinate, this.templateUrl));
    this.scheduler = new TileScheduler({
      concurrency: options.concurrency ?? 4,
      loadTile: tileLoader
    });

    const maxWorldTileCount = 2 ** this.effectiveMaxZoom;
    this.mercatorCanvas = document.createElement("canvas");
    this.mercatorCanvas.width = maxWorldTileCount * this.tileSize;
    this.mercatorCanvas.height = maxWorldTileCount * this.tileSize;
    this.outputCanvas = document.createElement("canvas");
    this.outputCanvas.width = this.mercatorCanvas.width;
    this.outputCanvas.height = this.mercatorCanvas.width / 2;
    this.projectionRowsPerFrame = options.projectionRowsPerFrame ??
      Math.max(
        MIN_PROJECTION_ROWS_PER_FRAME,
        Math.min(
          MAX_PROJECTION_ROWS_PER_FRAME,
          Math.floor(PROJECTION_PIXELS_PER_FRAME / this.outputCanvas.width)
        )
      );
    this.paintPlaceholder();
    this.texture = new CanvasTexture(this.outputCanvas);
    this.projectionLookupWorker = this.createProjectionLookupWorker();
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

    for (const resolve of this.projectionResolvers) {
      resolve();
    }

    this.projectionResolvers.length = 0;

    for (const pending of this.projectionLookupPending.values()) {
      pending.reject(new Error("Projection lookup disposed"));
    }

    this.projectionLookupPending.clear();
    this.projectionLookupWorker?.terminate();
    this.projectionLookupWorker = null;
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
      maxZoom: this.effectiveMaxZoom
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

    const mercatorBounds = this.drawTileToMercator(tile, coordinate);
    this.drawnTileKeys.add(key);
    const dirtyRows = this.computeDirtyOutputRowRange(mercatorBounds.top, mercatorBounds.bottom);
    this.scheduleProjectionRange(dirtyRows.start, dirtyRows.end);
  }

  private drawTileToMercator(
    tile: TileSource,
    coordinate: TileCoordinate
  ): { top: number; bottom: number } {
    const context = this.mercatorCanvas.getContext("2d");

    if (!context) {
      throw new Error("Mercator canvas context is not available");
    }

    const scale = 2 ** (this.effectiveMaxZoom - coordinate.z);
    const targetSize = this.tileSize * scale;

    context.drawImage(
      tile,
      coordinate.x * targetSize,
      coordinate.y * targetSize,
      targetSize,
      targetSize
    );

    const top = coordinate.y * targetSize;
    return {
      top,
      bottom: top + targetSize
    };
  }

  private projectMercatorToEquirectangular(startRow: number, endRow: number): void {
    const outputContext = this.outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Output canvas context is not available");
    }

    const sourceYLookup = this.projectionSourceYLookup;

    if (!sourceYLookup) {
      throw new Error("Projection source lookup is not available");
    }

    for (let y = startRow; y < endRow; y += 1) {
      outputContext.drawImage(
        this.mercatorCanvas,
        0,
        sourceYLookup[y],
        this.mercatorCanvas.width,
        1,
        0,
        y,
        this.outputCanvas.width,
        1
      );
    }
  }

  private computeDirtyOutputRowRange(
    mercatorTop: number,
    mercatorBottom: number
  ): { start: number; end: number } {
    const outputHeight = this.outputCanvas.height;
    const northLatitude = latitudeFromMercatorY(mercatorTop, this.mercatorCanvas.height);
    const southLatitude = latitudeFromMercatorY(mercatorBottom, this.mercatorCanvas.height);
    const northRow = Math.floor(((90 - northLatitude) / 180) * outputHeight) - 1;
    const southRow = Math.ceil(((90 - southLatitude) / 180) * outputHeight) + 1;
    const rangeStart = Math.max(0, Math.min(outputHeight, Math.min(northRow, southRow)));
    const rangeEnd = Math.max(0, Math.min(outputHeight, Math.max(northRow, southRow)));
    const clampedEnd = Math.max(rangeStart + 1, rangeEnd);

    return {
      start: rangeStart,
      end: clampedEnd
    };
  }

  private scheduleProjectionRange(startRow: number, endRow: number): void {
    const clampedStart = Math.max(0, Math.min(this.outputCanvas.height, Math.floor(startRow)));
    const clampedEnd = Math.max(0, Math.min(this.outputCanvas.height, Math.ceil(endRow)));

    if (clampedEnd <= clampedStart) {
      return;
    }

    if (!this.hasProjectedOnce) {
      this.insertDirtyProjectionRange(0, this.outputCanvas.height);
    } else {
      this.insertDirtyProjectionRange(clampedStart, clampedEnd);
    }

    this.requestProjectionFrame();
  }

  private insertDirtyProjectionRange(start: number, end: number): void {
    let mergedStart = start;
    let mergedEnd = end;
    const mergedRanges: Array<{ start: number; end: number }> = [];
    let inserted = false;

    for (const range of this.dirtyProjectionRanges) {
      if (range.end < mergedStart) {
        mergedRanges.push(range);
        continue;
      }

      if (mergedEnd < range.start) {
        if (!inserted) {
          mergedRanges.push({ start: mergedStart, end: mergedEnd });
          inserted = true;
        }
        mergedRanges.push(range);
        continue;
      }

      mergedStart = Math.min(mergedStart, range.start);
      mergedEnd = Math.max(mergedEnd, range.end);
    }

    if (!inserted) {
      mergedRanges.push({ start: mergedStart, end: mergedEnd });
    }

    this.dirtyProjectionRanges.splice(0, this.dirtyProjectionRanges.length, ...mergedRanges);
  }

  private requestProjectionFrame(): void {
    if (this.projectionFrameId !== null) {
      return;
    }

    this.projectionFrameId = window.requestAnimationFrame(() => {
      this.projectionFrameId = null;
      void this.processProjectionFrame().catch(() => {
        this.resolveProjectionPromises();
      });
    });
  }

  private async processProjectionFrame(): Promise<void> {
    await this.ensureProjectionSourceYLookup();

    if (!this.activeProjectionRange) {
      const nextRange = this.dirtyProjectionRanges.shift();

      if (!nextRange) {
        this.resolveProjectionPromises();
        return;
      }

      this.activeProjectionRange = {
        start: nextRange.start,
        end: nextRange.end,
        cursor: nextRange.start
      };
    }

    const activeRange = this.activeProjectionRange;
    const endRow = Math.min(
      activeRange.end,
      activeRange.cursor + this.projectionRowsPerFrame
    );
    this.projectMercatorToEquirectangular(activeRange.cursor, endRow);
    activeRange.cursor = endRow;

    if (activeRange.cursor < activeRange.end) {
      this.requestProjectionFrame();
      return;
    }

    this.activeProjectionRange = null;
    this.hasProjectedOnce = true;

    if (this.dirtyProjectionRanges.length > 0) {
      this.requestProjectionFrame();
      return;
    }

    this.texture.needsUpdate = true;
    this.context?.requestRender?.();
    this.resolveProjectionPromises();
  }

  private async ensureProjectionSourceYLookup(): Promise<Float32Array> {
    if (this.projectionSourceYLookup) {
      return this.projectionSourceYLookup;
    }

    if (this.projectionSourceYLookupPromise) {
      return await this.projectionSourceYLookupPromise;
    }

    const fallbackLookup = (): Float32Array => {
      const lookup = new Float32Array(this.outputCanvas.height);

      for (let row = 0; row < lookup.length; row += 1) {
        const latitude = 90 - ((row + 0.5) / this.outputCanvas.height) * 180;
        lookup[row] = mercatorYFromLatitude(latitude, this.mercatorCanvas.height);
      }

      return lookup;
    };

    if (!this.projectionLookupWorker) {
      this.projectionSourceYLookup = fallbackLookup();
      return this.projectionSourceYLookup;
    }

    const requestId = this.projectionLookupRequestId;
    this.projectionLookupRequestId += 1;
    const request: ProjectionRowLookupWorkerRequest = {
      id: requestId,
      outputHeight: this.outputCanvas.height,
      mercatorHeight: this.mercatorCanvas.height
    };

    this.projectionSourceYLookupPromise = new Promise<Float32Array>((resolve, reject) => {
      this.projectionLookupPending.set(requestId, { resolve, reject });
      this.projectionLookupWorker?.postMessage(request);
    }).catch(() => fallbackLookup()).finally(() => {
      this.projectionSourceYLookupPromise = null;
    });

    const lookup = await this.projectionSourceYLookupPromise;
    this.projectionSourceYLookup = lookup;
    return lookup;
  }

  private createProjectionLookupWorker(): Worker | null {
    if (typeof Worker !== "function") {
      return null;
    }

    try {
      const worker = new Worker(new URL("../workers/mercatorProjectionLookupWorker.ts", import.meta.url), {
        type: "module"
      });

      worker.onmessage = (event: MessageEvent<ProjectionRowLookupWorkerResponse>) => {
        const pending = this.projectionLookupPending.get(event.data.id);

        if (!pending) {
          return;
        }

        this.projectionLookupPending.delete(event.data.id);
        pending.resolve(new Float32Array(event.data.buffer));
      };

      worker.onerror = (event) => {
        const error = event.error ?? new Error(event.message);

        for (const pending of this.projectionLookupPending.values()) {
          pending.reject(error);
        }

        this.projectionLookupPending.clear();
        worker.terminate();

        if (this.projectionLookupWorker === worker) {
          this.projectionLookupWorker = null;
        }
      };

      return worker;
    } catch {
      return null;
    }
  }

  private flushProjection(): Promise<void> {
    if (
      this.projectionFrameId === null &&
      this.activeProjectionRange === null &&
      this.dirtyProjectionRanges.length === 0
    ) {
      return Promise.resolve();
    }

    if (this.projectionFrameId === null) {
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
