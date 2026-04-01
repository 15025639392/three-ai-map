import {
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
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
  private readonly batchGeometry = new PlaneGeometry(2, 2);
  private readonly batchMeshes: Array<Mesh<PlaneGeometry, MeshBasicMaterial>> = [];
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
      this.renderBatch(target, items);
    } finally {
      this.endFrame();
    }
  }

  drawTiles(target: WebGLRenderTarget, items: readonly GpuTileDrawItem[]): void {
    this.beginFrame(target, false);

    try {
      this.renderBatch(target, items);
    } finally {
      this.endFrame();
    }
  }

  drawTile(target: WebGLRenderTarget, item: GpuTileDrawItem): void {
    this.drawTiles(target, [item]);
  }

  dispose(): void {
    for (const mesh of this.batchMeshes) {
      const map = mesh.material.map;
      if (map) {
        map.dispose();
      }
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    this.batchMeshes.length = 0;
    this.batchGeometry.dispose();
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

  private renderBatch(target: WebGLRenderTarget, items: readonly GpuTileDrawItem[]): void {
    if (items.length === 0) {
      return;
    }

    let activeCount = 0;
    for (const item of items) {
      const rect = this.resolveDestinationRect(item.request);
      if (!rect) {
        continue;
      }

      const mesh = this.ensureBatchMesh(activeCount);
      const centerX = (rect.left + rect.right) * 0.5;
      const centerY = (rect.top + rect.bottom) * 0.5;
      const width = rect.right - rect.left;
      const height = rect.bottom - rect.top;
      mesh.position.set(
        (centerX / target.width) * 2 - 1,
        1 - (centerY / target.height) * 2,
        0
      );
      mesh.scale.set(width / target.width, height / target.height, 1);
      const texture = this.createSourceTexture(item.source, item.request.sourceCrop);
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
      mesh.visible = true;
      activeCount += 1;
    }

    if (activeCount === 0) {
      return;
    }

    this.renderer.setViewport(0, 0, target.width, target.height);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
    this.releaseBatchMaps(activeCount);
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

  private resolveDestinationRect(
    request: GpuTileDrawRequest
  ): { left: number; top: number; right: number; bottom: number } | null {
    const left = request.destinationX;
    const top = request.destinationY;
    const right = request.destinationX + request.destinationSize;
    const bottom = request.destinationY + request.destinationSize;

    if (right <= left || bottom <= top) {
      return null;
    }

    return {
      left,
      top,
      right,
      bottom
    };
  }

  private ensureBatchMesh(index: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
    let mesh = this.batchMeshes[index];

    if (!mesh) {
      const material = new MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });
      mesh = new Mesh(this.batchGeometry, material);
      this.batchMeshes.push(mesh);
      this.scene.add(mesh);
    }

    return mesh;
  }

  private releaseBatchMaps(activeCount: number): void {
    for (let index = 0; index < this.batchMeshes.length; index += 1) {
      const mesh = this.batchMeshes[index];

      if (index < activeCount) {
        const map = mesh.material.map;
        if (map) {
          map.dispose();
          mesh.material.map = null;
          mesh.material.needsUpdate = true;
        }
        mesh.visible = false;
        continue;
      }

      mesh.visible = false;
    }
  }
}
