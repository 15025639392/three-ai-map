import { Camera, Scene, SRGBColorSpace, WebGLRenderer } from "three";

interface RendererSystemOptions {
  container: HTMLElement;
  clearColor?: string;
}

export class RendererSystem {
  readonly renderer: WebGLRenderer;

  constructor({ container, clearColor = "#03060d" }: RendererSystemOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(clearColor);
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
