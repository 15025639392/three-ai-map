import { Layer } from './Layer';

export interface CustomLayerOptions {
  id: string;
  render?: (context: RenderContext) => boolean;
  update?: (context: UpdateContext) => boolean;
  onEvent?: (event: CustomEvent) => boolean;
  dispose?: () => void;
  visible?: boolean;
  zIndex?: number;
}

export interface RenderContext {
  time: number;
  delta: number;
  camera: any;
  renderer: any;
}

export interface UpdateContext {
  time: number;
  delta: number;
}

export interface CustomEvent {
  type: string;
  data?: any;
}

export class CustomLayer extends Layer {
  private renderCallback?: (context: RenderContext) => boolean;
  private updateCallback?: (context: UpdateContext) => boolean;
  private eventCallback?: (event: CustomEvent) => boolean;
  private disposeCallback?: () => void;
  private customData: any = undefined;
  private _visible: boolean;
  private _zIndex: number;
  
  constructor(options: CustomLayerOptions) {
    super(options.id);
    
    this.renderCallback = options.render;
    this.updateCallback = options.update;
    this.eventCallback = options.onEvent;
    this.disposeCallback = options.dispose;
    this._visible = options.visible ?? true;
    this._zIndex = options.zIndex ?? 0;
  }
  
  render(context: RenderContext): boolean {
    if (!this._visible) return false;
    if (!this.renderCallback) return true;
    return this.renderCallback(context);
  }

  override update(_deltaTime: number, _context: any): void {
    if (!this._visible) return;
    if (!this.updateCallback) return;
    // Note: CustomLayer uses simplified UpdateContext, ignoring base LayerContext
    this.updateCallback({ time: 0, delta: _deltaTime });
  }
  
  handleEvent(event: CustomEvent): boolean {
    if (!this.eventCallback) return false;
    return this.eventCallback(event);
  }
  
  setData(data: any): void {
    this.customData = data;
  }
  
  getData(): any {
    return this.customData;
  }
  
  isVisible(): boolean {
    return this._visible;
  }
  
  setVisible(visible: boolean): void {
    this._visible = visible;
  }
  
  getZIndex(): number {
    return this._zIndex;
  }
  
  setZIndex(zIndex: number): void {
    this._zIndex = zIndex;
  }
  
  dispose(): void {
    if (this.disposeCallback) {
      this.disposeCallback();
    }
    this.customData = undefined;
    this.renderCallback = undefined;
    this.updateCallback = undefined;
    this.eventCallback = undefined;
    this.disposeCallback = undefined;
  }
}
