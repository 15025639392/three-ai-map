import { PerspectiveCamera, type Object3D } from "three";
import { LayerErrorPayload, LayerRecoveryOverrides, LayerRecoveryQuery, type LayerContext } from "../layers/Layer";
import { RasterLayer } from "../layers/RasterLayer";
import { TerrainTileLayer } from "../layers/TerrainTileLayer";
import type { Source } from "../sources/Source";
import type { SurfaceTilePlan } from "../tiles/SurfaceTilePlanner";

interface SurfaceSystemOptions {
  scene: Object3D;
  camera: PerspectiveCamera;
  radius: number;
  rendererElement?: HTMLCanvasElement;
  requestRender?: () => void;
  reportError?: (payload: LayerErrorPayload) => void;
  resolveRecovery?: (query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined;
  getSource?: (id: string) => Source | undefined;
  getSurfaceTilePlan?: () => SurfaceTilePlan;
}

export class SurfaceSystem {
  private readonly context: LayerContext;
  private terrainLayer: TerrainTileLayer | null = null;
  private readonly imageryLayers = new Map<string, RasterLayer>();
  private nextAddOrder = 0;

  constructor(options: SurfaceSystemOptions) {
    this.context = {
      scene: options.scene,
      camera: options.camera,
      radius: options.radius,
      rendererElement: options.rendererElement,
      requestRender: options.requestRender,
      reportError: options.reportError,
      resolveRecovery: options.resolveRecovery,
      getSource: options.getSource,
      getTerrainHost: () => this.terrainLayer,
      getSurfaceTilePlan: options.getSurfaceTilePlan
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
      this.syncTerrainColorWriteMode();
      return;
    }

    layer.addOrder = this.nextAddOrder;
    this.nextAddOrder += 1;
    this.imageryLayers.set(layer.id, layer);
    layer.onAdd(this.context);
    this.syncTerrainColorWriteMode();
  }

  remove(layerId: string): void {
    if (this.terrainLayer?.id === layerId) {
      const layer = this.terrainLayer;
      this.terrainLayer = null;
      layer.onRemove(this.context);
      layer.dispose();
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
    this.syncTerrainColorWriteMode();
  }

  clear(): void {
    if (this.terrainLayer) {
      this.remove(this.terrainLayer.id);
    }

    for (const layerId of [...this.imageryLayers.keys()]) {
      this.remove(layerId);
    }
  }

  update(deltaTime: number): void {
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

  getTerrainHost(): TerrainTileLayer | null {
    return this.terrainLayer;
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

  getOrderedLayerIds(): string[] {
    const ids: string[] = [];

    if (this.terrainLayer) {
      ids.push(this.terrainLayer.id);
    }

    ids.push(...this.getOrderedImageryLayers().map((layer) => layer.id));
    return ids;
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
    // When imagery layers are visible, keep terrain in depth path but disable color writes.
    this.terrainLayer.setColorWriteEnabled(!this.hasVisibleImageryLayers());
  }
}
