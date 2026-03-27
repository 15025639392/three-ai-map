import { Texture } from "three";
import { Layer, LayerContext } from "./Layer";

export class ImageryLayer extends Layer {
  private readonly texture: Texture;

  constructor(id: string, texture: Texture) {
    super(id);
    this.texture = texture;
  }

  onAdd(context: LayerContext): void {
    context.globe.setTexture(this.texture);
  }

  onRemove(context: LayerContext): void {
    context.globe.setTexture(null);
  }
}
