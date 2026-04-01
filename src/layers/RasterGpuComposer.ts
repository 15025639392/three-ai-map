import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Texture,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";
import type { TileSource } from "../tiles/tileLoader";

export interface GpuSourceCropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GpuTileDrawRequest {
  destinationX: number;
  destinationY: number;
  destinationSize: number;
  sourceCrop?: GpuSourceCropRegion;
}

export interface GpuTileDrawItem {
  request: GpuTileDrawRequest;
  source: TileSource;
}

export class RasterGpuComposer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: MeshBasicMaterial;
  private readonly quad: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly placeholderTexture: DataTexture;
  private readonly savedViewport = new Vector4();
  private readonly savedScissor = new Vector4();
  private readonly savedClearColor = new Color();
  private savedClearAlpha = 1;
  private savedAutoClear = true;
  private savedScissorTest = false;
  private savedRenderTarget: WebGLRenderTarget | null = null;
  private frameActive = false;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.placeholderTexture = new DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType
    );
    this.placeholderTexture.needsUpdate = true;
    this.placeholderTexture.generateMipmaps = false;
    this.placeholderTexture.minFilter = LinearFilter;
    this.placeholderTexture.magFilter = LinearFilter;
    this.placeholderTexture.wrapS = ClampToEdgeWrapping;
    this.placeholderTexture.wrapT = ClampToEdgeWrapping;
    this.material = new MeshBasicMaterial({
      map: this.placeholderTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  createRenderTarget(size: number): WebGLRenderTarget {
    const resolvedSize = Math.max(1, Math.round(size));
    const renderTarget = new WebGLRenderTarget(resolvedSize, resolvedSize, {
      depthBuffer: false,
      stencilBuffer: false
    });
    renderTarget.texture.generateMipmaps = false;
    renderTarget.texture.minFilter = LinearFilter;
    renderTarget.texture.magFilter = LinearFilter;
    renderTarget.texture.wrapS = ClampToEdgeWrapping;
    renderTarget.texture.wrapT = ClampToEdgeWrapping;
    return renderTarget;
  }

  composeTiles(target: WebGLRenderTarget, items: readonly GpuTileDrawItem[]): void {
    this.beginFrame(target, true);

    try {
      for (const item of items) {
        this.drawTileInternal(target, item);
      }
    } finally {
      this.endFrame();
    }
  }

  drawTile(target: WebGLRenderTarget, item: GpuTileDrawItem): void {
    this.beginFrame(target, false);

    try {
      this.drawTileInternal(target, item);
    } finally {
      this.endFrame();
    }
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
    this.placeholderTexture.dispose();
  }

  private beginFrame(target: WebGLRenderTarget, clear: boolean): void {
    if (this.frameActive) {
      throw new Error("RasterGpuComposer frame already active");
    }

    this.frameActive = true;
    this.savedRenderTarget = this.renderer.getRenderTarget();
    this.savedAutoClear = this.renderer.autoClear;
    this.savedScissorTest = this.renderer.getScissorTest();
    this.renderer.getViewport(this.savedViewport);
    this.renderer.getScissor(this.savedScissor);
    this.renderer.getClearColor(this.savedClearColor);
    this.savedClearAlpha = this.renderer.getClearAlpha();

    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(target);

    if (clear) {
      this.renderer.setViewport(0, 0, target.width, target.height);
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, false);
    }
  }

  private endFrame(): void {
    if (!this.frameActive) {
      return;
    }

    this.renderer.setScissorTest(this.savedScissorTest);
    this.renderer.setViewport(this.savedViewport);
    this.renderer.setScissor(this.savedScissor);
    this.renderer.setClearColor(this.savedClearColor, this.savedClearAlpha);
    this.renderer.autoClear = this.savedAutoClear;
    this.renderer.setRenderTarget(this.savedRenderTarget);
    this.savedRenderTarget = null;
    this.frameActive = false;
  }

  private drawTileInternal(target: WebGLRenderTarget, item: GpuTileDrawItem): void {
    const drawRect = this.resolveDrawRect(target, item.request);

    if (!drawRect) {
      return;
    }

    const sourceTexture = this.createSourceTexture(item.source, item.request.sourceCrop);

    try {
      this.material.map = sourceTexture;
      this.renderer.setViewport(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      this.renderer.setScissor(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.camera);
      this.material.map = this.placeholderTexture;
    } finally {
      sourceTexture.dispose();
    }
  }

  private createSourceTexture(source: TileSource, sourceCrop?: GpuSourceCropRegion): Texture {
    const texture = new Texture(source);
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.matrixAutoUpdate = false;

    if (sourceCrop) {
      texture.matrix.setUvTransform(
        sourceCrop.x,
        1 - sourceCrop.y - sourceCrop.height,
        sourceCrop.width,
        sourceCrop.height,
        0,
        0,
        0
      );
    } else {
      texture.matrix.identity();
    }

    texture.needsUpdate = true;
    return texture;
  }

  private resolveDrawRect(
    target: WebGLRenderTarget,
    request: GpuTileDrawRequest
  ): { x: number; y: number; width: number; height: number } | null {
    const left = Math.max(0, Math.floor(request.destinationX));
    const top = Math.max(0, Math.floor(request.destinationY));
    const right = Math.min(target.width, Math.ceil(request.destinationX + request.destinationSize));
    const bottom = Math.min(target.height, Math.ceil(request.destinationY + request.destinationSize));

    if (right <= left || bottom <= top) {
      return null;
    }

    return {
      x: left,
      y: target.height - bottom,
      width: right - left,
      height: bottom - top
    };
  }
}
