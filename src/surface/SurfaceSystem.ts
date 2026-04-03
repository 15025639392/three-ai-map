import { PerspectiveCamera, type Object3D, type WebGLRenderer } from "three";
import { LayerErrorPayload, LayerRecoveryOverrides, LayerRecoveryQuery, type LayerContext } from "../layers/Layer";
import { RasterLayer } from "../layers/RasterLayer";
import { TerrainTileLayer } from "../layers/TerrainTileLayer";
import type { SurfacePlannerConfig } from "./SurfaceHost";
import type { Source } from "../sources/Source";
import {
  planSurfaceTileNodes,
  type SurfaceTileInteractionPhase,
  type SurfaceTilePlan
} from "../tiles/SurfaceTilePlanner";

interface SurfaceSystemOptions {
  scene: Object3D;
  camera: PerspectiveCamera;
  radius: number;
  rendererElement?: HTMLCanvasElement;
  getRenderer?: () => WebGLRenderer | null;
  requestRender?: () => void;
  reportError?: (payload: LayerErrorPayload) => void;
  resolveRecovery?: (query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined;
  getSource?: (id: string) => Source | undefined;
}

const SURFACE_TILE_PLAN_MESH_MAX_SEGMENTS = 32;
const SURFACE_TILE_PLAN_MIN_ZOOM = 1;
const SURFACE_TILE_PLAN_MAX_ZOOM = 18;
const SURFACE_TILE_NODE_MORPH_DURATION_MS = 220;
const INTERACTION_IDLE_DELAY_MS = 180;

export class SurfaceSystem {
  private readonly context: LayerContext;
  private terrainLayer: TerrainTileLayer | null = null;
  private readonly imageryLayers = new Map<string, RasterLayer>();
  private nextAddOrder = 0;
  private imageryCoverageEstablished = false;
  private interactionPhase: SurfaceTileInteractionPhase = "idle";
  private currentSurfaceTilePlan: SurfaceTilePlan | null = null;
  private interactionIdleTimeoutId: number | null = null;
  private readonly surfaceTileNodeMorphStartTimes = new Map<string, number>();

  constructor(options: SurfaceSystemOptions) {
    this.context = {
      scene: options.scene,
      camera: options.camera,
      radius: options.radius,
      rendererElement: options.rendererElement,
      getRenderer: options.getRenderer,
      requestRender: options.requestRender,
      reportError: options.reportError,
      resolveRecovery: options.resolveRecovery,
      getSource: options.getSource,
      getSurfaceHost: () => this.terrainLayer,
      getSurfaceTilePlan: () => this.getSurfaceTilePlan()
    };
  }

  add(layer: TerrainTileLayer | RasterLayer): void {
    if (this.has(layer.id)) {
      throw new Error(`Layer "${layer.id}" already exists`);
    }

    if (layer instanceof TerrainTileLayer) {
      if (this.terrainLayer && this.terrainLayer !== layer) {
        throw new Error("Only one TerrainTileLayer can be added to SurfaceSystem at a time");
      }

      layer.addOrder = this.nextAddOrder;
      this.nextAddOrder += 1;
      this.terrainLayer = layer;
      layer.onAdd(this.context);
      this.invalidateSurfaceTilePlan();
      this.updateImageryCoverageState();
      this.syncTerrainColorWriteMode();
      return;
    }

    layer.addOrder = this.nextAddOrder;
    this.nextAddOrder += 1;
    this.imageryLayers.set(layer.id, layer);
    layer.onAdd(this.context);
    this.invalidateSurfaceTilePlan();
    this.updateImageryCoverageState();
    this.syncTerrainColorWriteMode();
  }

  remove(layerId: string): void {
    if (this.terrainLayer?.id === layerId) {
      const layer = this.terrainLayer;
      this.terrainLayer = null;
      layer.onRemove(this.context);
      layer.dispose();
      this.invalidateSurfaceTilePlan();
      this.updateImageryCoverageState();
      this.syncTerrainColorWriteMode();
      return;
    }

    const imagery = this.imageryLayers.get(layerId);

    if (!imagery) {
      return;
    }

    this.imageryLayers.delete(layerId);
    imagery.onRemove(this.context);
    imagery.dispose();
    this.invalidateSurfaceTilePlan();
    this.updateImageryCoverageState();
    this.syncTerrainColorWriteMode();
  }

  clear(): void {
    this.clearInteractionIdleTimeout();
    this.invalidateSurfaceTilePlan();

    if (this.terrainLayer) {
      this.remove(this.terrainLayer.id);
    }

    for (const layerId of [...this.imageryLayers.keys()]) {
      this.remove(layerId);
    }
  }

  update(deltaTime: number): void {
    this.currentSurfaceTilePlan = null;

    this.updateImageryCoverageState();
    this.syncTerrainColorWriteMode();

    if (this.terrainLayer?.visible) {
      this.terrainLayer.update(deltaTime, this.context);
    }

    for (const layer of this.getOrderedImageryLayers()) {
      if (!layer.visible) {
        continue;
      }

      layer.update(deltaTime, this.context);
    }

    this.updateImageryCoverageState();
    this.syncTerrainColorWriteMode();
  }

  notifyCameraChanged(programmatic = false): void {
    if (programmatic) {
      this.interactionPhase = "idle";
      this.clearInteractionIdleTimeout();
      this.invalidateSurfaceTilePlan();
      return;
    }

    this.interactionPhase = "interacting";
    this.scheduleInteractionIdleReset();
    this.invalidateSurfaceTilePlan();
  }

  get(layerId: string): TerrainTileLayer | RasterLayer | undefined {
    if (this.terrainLayer?.id === layerId) {
      return this.terrainLayer;
    }

    return this.imageryLayers.get(layerId);
  }

  has(layerId: string): boolean {
    return this.terrainLayer?.id === layerId || this.imageryLayers.has(layerId);
  }

  getSurfaceHost(): TerrainTileLayer | null {
    return this.terrainLayer;
  }

  getSurfacePlannerConfig(): SurfacePlannerConfig | null {
    return this.terrainLayer?.getPlannerConfig?.() ?? null;
  }

  hasVisibleSurfaceLayers(): boolean {
    if (this.terrainLayer?.visible) {
      return true;
    }

    for (const layer of this.imageryLayers.values()) {
      if (layer.visible) {
        return true;
      }
    }

    return false;
  }

  hasVisibleImageryLayers(): boolean {
    for (const layer of this.imageryLayers.values()) {
      if (layer.visible) {
        return true;
      }
    }

    return false;
  }

  hasEstablishedImageryCoverage(): boolean {
    return this.imageryCoverageEstablished;
  }

  getOrderedLayerIds(): string[] {
    const ids: string[] = [];

    if (this.terrainLayer) {
      ids.push(this.terrainLayer.id);
    }

    ids.push(...this.getOrderedImageryLayers().map((layer) => layer.id));
    return ids;
  }

  getVisibleTileKeys(): string[] {
    return this.getSurfaceTilePlan().nodes.map((node) => node.key);
  }

  getVisibleTileCount(): number {
    return this.getVisibleTileKeys().length;
  }

  getVisibleImageryTileCount(sourceId?: string): number {
    let count = 0;

    for (const layer of this.getOrderedImageryLayers()) {
      if (!layer.visible) {
        continue;
      }

      const stats = layer.getDebugStats();
      if (sourceId && stats.sourceId !== sourceId) {
        continue;
      }

      count += stats.activeTileCount;
    }

    return count;
  }

  getImageryRequestCount(sourceId?: string): number {
    let count = 0;
    const countedSourceIds = new Set<string>();

    for (const layer of this.getOrderedImageryLayers()) {
      if (!layer.visible) {
        continue;
      }

      const stats = layer.getDebugStats();
      if (sourceId && stats.sourceId !== sourceId) {
        continue;
      }

      if (countedSourceIds.has(stats.sourceId)) {
        continue;
      }

      countedSourceIds.add(stats.sourceId);
      count += stats.requestCount;
    }

    return count;
  }

  private getOrderedImageryLayers(): RasterLayer[] {
    return [...this.imageryLayers.values()].sort((left, right) => {
      const leftZ = left.zIndex ?? 0;
      const rightZ = right.zIndex ?? 0;

      if (leftZ !== rightZ) {
        return leftZ - rightZ;
      }

      if (left.addOrder !== right.addOrder) {
        return left.addOrder - right.addOrder;
      }

      return left.id.localeCompare(right.id);
    });
  }

  private syncTerrainColorWriteMode(): void {
    if (!this.terrainLayer) {
      return;
    }

    // Cesium-style composition: terrain supplies geometry, imagery supplies color.
    // Once imagery coverage has been established, keep terrain color writes disabled
    // to avoid fallback flashes between terrain base color and imagery.
    this.terrainLayer.setColorWriteEnabled(!this.imageryCoverageEstablished);
  }

  private updateImageryCoverageState(): void {
    if (!this.hasVisibleImageryLayers()) {
      this.imageryCoverageEstablished = false;
      return;
    }

    if (this.imageryCoverageEstablished) {
      return;
    }

    for (const layer of this.imageryLayers.values()) {
      if (!layer.visible) {
        continue;
      }

      if (layer.hasRenderableTiles()) {
        this.imageryCoverageEstablished = true;
        return;
      }
    }
  }

  private getSurfaceTilePlan(): SurfaceTilePlan {
    if (this.currentSurfaceTilePlan) {
      return this.currentSurfaceTilePlan;
    }

    this.context.camera.updateMatrixWorld(true);
    this.currentSurfaceTilePlan = this.buildSurfaceTilePlan();
    return this.currentSurfaceTilePlan;
  }

  private buildSurfaceTilePlan(): SurfaceTilePlan {
    const plannerConfig = this.getSurfacePlannerConfig();
    const viewportWidth =
      this.context.rendererElement?.clientWidth ||
      this.context.rendererElement?.width ||
      1;
    const viewportHeight =
      this.context.rendererElement?.clientHeight ||
      this.context.rendererElement?.height ||
      1;

    const now = performance.now();
    const plan = planSurfaceTileNodes({
      camera: this.context.camera,
      viewportWidth,
      viewportHeight,
      radius: this.context.radius,
      meshMaxSegments: plannerConfig?.meshMaxSegments ?? SURFACE_TILE_PLAN_MESH_MAX_SEGMENTS,
      minZoom: plannerConfig?.minZoom ?? SURFACE_TILE_PLAN_MIN_ZOOM,
      maxZoom: plannerConfig?.maxZoom ?? SURFACE_TILE_PLAN_MAX_ZOOM,
      interactionPhase: this.interactionPhase
    });
    const activeKeys = new Set(plan.nodes.map((node) => node.key));

    for (const key of this.surfaceTileNodeMorphStartTimes.keys()) {
      if (!activeKeys.has(key)) {
        this.surfaceTileNodeMorphStartTimes.delete(key);
      }
    }

    const nodes = plan.nodes.map((node) => {
      const existingStartTime = this.surfaceTileNodeMorphStartTimes.get(node.key);
      const startTime = existingStartTime ?? now;

      if (existingStartTime === undefined) {
        this.surfaceTileNodeMorphStartTimes.set(node.key, startTime);
      }

      const elapsed = Math.max(0, now - startTime);
      const morphFactor = Math.min(1, elapsed / SURFACE_TILE_NODE_MORPH_DURATION_MS);
      return { ...node, morphFactor };
    });

    return { ...plan, nodes };
  }

  private scheduleInteractionIdleReset(): void {
    this.clearInteractionIdleTimeout();
    this.interactionIdleTimeoutId = window.setTimeout(() => {
      this.interactionIdleTimeoutId = null;
      if (this.interactionPhase === "idle") {
        return;
      }

      // 相机静止后切回 idle，相应降低请求密度并触发新一轮稳态选瓦片。
      this.interactionPhase = "idle";
      this.invalidateSurfaceTilePlan();
      this.context.requestRender?.();
    }, INTERACTION_IDLE_DELAY_MS);
  }

  private clearInteractionIdleTimeout(): void {
    if (this.interactionIdleTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.interactionIdleTimeoutId);
    this.interactionIdleTimeoutId = null;
  }

  private invalidateSurfaceTilePlan(): void {
    this.currentSurfaceTilePlan = null;
  }
}
