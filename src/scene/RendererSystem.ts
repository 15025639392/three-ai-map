import { Camera, Scene, SRGBColorSpace, WebGLRenderer } from "three";

export interface RendererSystemOptions {
  container: HTMLElement;
  background?: string;
  clearColor?: string;
}

function canUseWebGL(): boolean {
  return typeof window !== "undefined" && "WebGLRenderingContext" in window;
}

export class RendererSystem {
  readonly renderer: WebGLRenderer | { domElement: HTMLCanvasElement };

  constructor({ container, background, clearColor }: RendererSystemOptions) {
    const resolvedBackground = background ?? clearColor ?? "#03060d";

    if (canUseWebGL()) {
      const renderer = new WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(resolvedBackground);
      renderer.outputColorSpace = SRGBColorSpace;
      this.renderer = renderer;
    } else {
      const canvas = document.createElement("canvas");
      canvas.dataset.rendererMode = "headless";
      canvas.style.background = resolvedBackground;
      this.renderer = { domElement: canvas };
    }

    container.appendChild(this.renderer.domElement);
    const width = container.clientWidth || container.getBoundingClientRect().width || 1;
    const height = container.clientHeight || container.getBoundingClientRect().height || 1;
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    if (this.renderer instanceof WebGLRenderer) {
      this.renderer.setSize(width, height, false);
      return;
    }

    this.renderer.domElement.width = Math.max(1, Math.floor(width));
    this.renderer.domElement.height = Math.max(1, Math.floor(height));
    this.renderer.domElement.style.width = `${Math.max(1, width)}px`;
    this.renderer.domElement.style.height = `${Math.max(1, height)}px`;
  }

  render(scene: Scene, camera: Camera): void {
    if (this.renderer instanceof WebGLRenderer) {
      this.renderer.render(scene, camera);
      return;
    }

    void scene;
    void camera;
  }

  getWebGLRenderer(): WebGLRenderer | null {
    return this.renderer instanceof WebGLRenderer ? this.renderer : null;
  }

  dispose(): void {
    if (this.renderer instanceof WebGLRenderer) {
      this.renderer.dispose();
    }

    this.renderer.domElement.remove();
  }
}
