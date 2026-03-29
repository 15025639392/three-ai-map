import { Raycaster } from "three";
import { Layer, LayerContext, PickResult } from "./Layer";

export class LayerManager {
  private readonly context: LayerContext;
  private readonly layers = new Map<string, Layer>();
  private nextAddOrder = 0;

  constructor(context: LayerContext) {
    this.context = context;
  }

  add(layer: Layer): void {
    if (this.layers.has(layer.id)) {
      throw new Error(`Layer "${layer.id}" already exists`);
    }

    layer.addOrder = this.nextAddOrder;
    this.nextAddOrder += 1;
    this.layers.set(layer.id, layer);
    layer.onAdd(this.context);
  }

  remove(layerId: string): void {
    const layer = this.layers.get(layerId);

    if (!layer) {
      return;
    }

    layer.onRemove(this.context);
    layer.dispose();
    this.layers.delete(layerId);
  }

  get(layerId: string): Layer | undefined {
    return this.layers.get(layerId);
  }

  update(deltaTime: number): void {
    for (const layer of this.getOrderedLayers()) {
      if (!layer.visible) {
        continue;
      }

      layer.update(deltaTime, this.context);
    }
  }

  pick(raycaster: Raycaster): PickResult | null {
    const orderedLayers = this.getOrderedLayers().reverse();

    for (const layer of orderedLayers) {
      if (!layer.visible) {
        continue;
      }

      const result = layer.pick(raycaster, this.context);

      if (result) {
        return result;
      }
    }

    return null;
  }

  clear(): void {
    for (const layerId of this.layers.keys()) {
      this.remove(layerId);
    }
  }

  getOrderedLayerIds(): string[] {
    return this.getOrderedLayers().map((layer) => layer.id);
  }

  private getOrderedLayers(): Layer[] {
    return Array.from(this.layers.values()).sort((left, right) => {
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
}
