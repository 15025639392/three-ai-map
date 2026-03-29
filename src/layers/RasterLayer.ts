import {
  BufferGeometry,
  ClampToEdgeWrapping,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Texture
} from "three";
import { TileRequestCancelledError } from "../tiles/TileScheduler";
import type { TileCoordinate } from "../tiles/TileViewport";
import type { TileSource } from "../tiles/tileLoader";
import { RasterTileSource } from "../sources/RasterTileSource";
import { Layer, LayerContext, LayerRecoveryOverrides } from "./Layer";

export interface RasterLayerOptions {
  id: string;
  source: string;
  opacity?: number;
  zIndex?: number;
  imageryRetryAttempts?: number;
  imageryRetryDelayMs?: number;
  imageryFallbackColor?: string | null;
}

interface RasterTileEntry {
  promise: Promise<void>;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  loading: boolean;
}

class StaleRasterTileError extends Error {
  constructor() {
    super("Raster tile entry is no longer current");
  }
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

function parseTileKey(key: string): TileCoordinate {
  const [z, x, y] = key.split("/").map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid tile key: ${key}`);
  }

  return { z, x, y };
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

function createSolidColorFallback(color: string, size = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function resolveImageryRecoveryConfig(
  context: LayerContext | null,
  layerId: string,
  defaults: { attempts: number; delayMs: number; fallbackColor: string | null }
): { attempts: number; delayMs: number; fallbackColor: string | null } {
  const baseAttempts = defaults.attempts;
  const baseDelayMs = defaults.delayMs;
  const baseFallbackColor = defaults.fallbackColor;

  if (!context?.resolveRecovery) {
    return { attempts: baseAttempts, delayMs: baseDelayMs, fallbackColor: baseFallbackColor };
  }

  const overrides = context.resolveRecovery({
    layerId,
    stage: "imagery",
    category: "network",
    severity: "warn"
  });

  const attempts = Math.max(0, Math.floor(overrides?.imageryRetryAttempts ?? baseAttempts));
  const delayMs = Math.max(0, Math.floor(overrides?.imageryRetryDelayMs ?? baseDelayMs));
  const fallbackColor =
    overrides?.imageryFallbackColor !== undefined ? overrides.imageryFallbackColor : baseFallbackColor;

  return { attempts, delayMs, fallbackColor };
}

const RASTER_BASE = 1000;
const ZINDEX_STRIDE = 1000;

export class RasterLayer extends Layer {
  private readonly sourceId: string;
  private readonly opacity: number;
  private readonly imageryRetryAttempts: number;
  private readonly imageryRetryDelayMs: number;
  private readonly imageryFallbackColor: string | null;
  private readonly group = new Group();
  private readonly activeTiles = new Map<string, RasterTileEntry>();
  private context: LayerContext | null = null;
  private cachedRecoveryConfig:
    | { attempts: number; delayMs: number; fallbackColor: string | null }
    | null = null;

  constructor(options: RasterLayerOptions) {
    super(options.id);
    this.sourceId = options.source;
    this.opacity = Math.max(0, Math.min(1, options.opacity ?? 1));
    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex;
    }
    this.imageryRetryAttempts = Math.max(0, Math.floor(options.imageryRetryAttempts ?? 0));
    this.imageryRetryDelayMs = Math.max(0, Math.floor(options.imageryRetryDelayMs ?? 0));
    this.imageryFallbackColor = options.imageryFallbackColor ?? null;
    this.group.name = options.id;
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    this.cachedRecoveryConfig = null;
    context.scene.add(this.group);
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    this.clearActiveTiles();
    this.context = null;
    this.cachedRecoveryConfig = null;
  }

  update(_deltaTime: number, context: LayerContext): void {
    this.syncTiles(context);
  }

  dispose(): void {
    this.clearActiveTiles();
  }

  private syncTiles(context: LayerContext): void {
    const host = context.getTerrainHost?.();

    if (!host) {
      this.clearActiveTiles();
      return;
    }

    const hostKeys = new Set(host.getActiveTileKeys());

    for (const key of this.activeTiles.keys()) {
      if (!hostKeys.has(key)) {
        this.removeTile(key);
      }
    }

    for (const key of hostKeys) {
      if (!host.getActiveTileMesh(key)) {
        continue;
      }
      void this.ensureTile(key);
    }
  }

  private ensureTile(tileKey: string): Promise<void> {
    const existing = this.activeTiles.get(tileKey);

    if (existing?.mesh || existing?.loading) {
      return existing.promise;
    }

    const entry: RasterTileEntry = existing ?? { promise: Promise.resolve(), mesh: null, loading: false };
    this.activeTiles.set(tileKey, entry);

    const isCurrent = () => this.activeTiles.get(tileKey) === entry;

    entry.loading = true;
    entry.promise = this.loadTileMesh(tileKey, isCurrent)
      .then((mesh) => {
        if (!isCurrent()) {
          mesh.geometry.dispose();
          mesh.material.dispose();
          throw new StaleRasterTileError();
        }

        if (entry.mesh) {
          this.group.remove(entry.mesh);
          entry.mesh.material.map?.dispose();
          entry.mesh.material.dispose();
        }

        entry.mesh = mesh;
        this.group.add(mesh);
        this.context?.requestRender?.();
      })
      .catch((error) => {
        if (error instanceof StaleRasterTileError || isTileRequestAbort(error)) {
          return;
        }

        let coordinate: TileCoordinate | undefined;
        try {
          coordinate = parseTileKey(tileKey);
        } catch {
          coordinate = undefined;
        }

        this.emitLayerError(this.context, {
          stage: "imagery",
          category: "network",
          severity: "warn",
          error,
          recoverable: true,
          tileKey,
          metadata: { source: this.sourceId, coordinate }
        });
      })
      .finally(() => {
        if (isCurrent()) {
          entry.loading = false;
        }
      });

    void entry.promise.catch(() => undefined);
    return entry.promise;
  }

  private async loadTileMesh(
    tileKey: string,
    isCurrent: () => boolean
  ): Promise<Mesh<BufferGeometry, MeshStandardMaterial>> {
    const context = this.context;

    if (!context) {
      throw new Error("RasterLayer missing context");
    }

    const host = context.getTerrainHost?.();

    if (!host) {
      throw new Error("RasterLayer requires a TerrainTileLayer host");
    }

    const hostMesh = host.getActiveTileMesh(tileKey);

    if (!hostMesh) {
      throw new Error(`RasterLayer missing host mesh for tile ${tileKey}`);
    }

    const source = context.getSource?.(this.sourceId);

    if (!source) {
      throw new Error(`RasterLayer source not found: ${this.sourceId}`);
    }

    if (!(source instanceof RasterTileSource)) {
      throw new Error(`RasterLayer source "${this.sourceId}" is not a RasterTileSource`);
    }

    const coordinate = parseTileKey(tileKey);
    const recoveryConfig = this.cachedRecoveryConfig ?? (
      this.cachedRecoveryConfig = resolveImageryRecoveryConfig(context, this.id, {
        attempts: this.imageryRetryAttempts,
        delayMs: this.imageryRetryDelayMs,
        fallbackColor: this.imageryFallbackColor
      })
    );

    let imagery: TileSource;
    let usedFallback = false;
    let lastError: unknown = null;
    let attemptsUsed = 0;

    for (let attempt = 0; attempt <= recoveryConfig.attempts; attempt += 1) {
      attemptsUsed = attempt + 1;
      try {
        imagery = await source.request(coordinate);
        lastError = null;
        break;
      } catch (error) {
        if (isTileRequestAbort(error)) {
          throw error;
        }

        lastError = error;

        if (attempt < recoveryConfig.attempts) {
          if (recoveryConfig.delayMs > 0) {
            await sleep(recoveryConfig.delayMs);
          } else {
            await new Promise<void>((resolve) => {
              queueMicrotask(resolve);
            });
          }
          continue;
        }

        if (recoveryConfig.fallbackColor) {
          imagery = createSolidColorFallback(recoveryConfig.fallbackColor);
          usedFallback = true;
          break;
        }

        throw error;
      }
    }

    if (!isCurrent()) {
      throw new StaleRasterTileError();
    }

    if (usedFallback) {
      this.emitLayerError(this.context, {
        stage: "imagery",
        category: "network",
        severity: "warn",
        error: lastError,
        recoverable: true,
        tileKey,
        metadata: {
          source: this.sourceId,
          coordinate,
          attempts: attemptsUsed,
          fallbackUsed: true
        }
      });
    }

    const texture = createTexture(imagery!);
    const material = new MeshStandardMaterial({
      map: texture,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const mesh = new Mesh(hostMesh.geometry, material);
    mesh.name = `${this.id}:${tileKey}`;
    const zBucket = Math.max(0, this.zIndex ?? this.addOrder);
    mesh.renderOrder = RASTER_BASE + zBucket * ZINDEX_STRIDE + this.addOrder;
    return mesh;
  }

  private removeTile(tileKey: string): boolean {
    const entry = this.activeTiles.get(tileKey);

    if (!entry) {
      return false;
    }

    const source = this.context?.getSource?.(this.sourceId);

    if (source instanceof RasterTileSource) {
      source.cancel(tileKey);
    }

    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.material.map?.dispose();
      entry.mesh.material.dispose();
    }

    this.activeTiles.delete(tileKey);
    return true;
  }

  private clearActiveTiles(): void {
    for (const key of [...this.activeTiles.keys()]) {
      this.removeTile(key);
    }
  }
}
