import { Camera, PerspectiveCamera, Scene } from "three";
import { RendererSystem } from "../core/RendererSystem";

export interface EngineView {
  lng: number;
  lat: number;
  altitude: number;
}

export interface RendererAdapter {
  renderer: {
    domElement: HTMLCanvasElement;
  };
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export interface RendererFactoryOptions {
  container: HTMLElement;
  clearColor?: string;
}

export interface GlobeEngineOptions {
  container: HTMLElement;
  radius?: number;
  background?: string;
  terrainStrength?: number;
  camera?: Partial<Pick<PerspectiveCamera, "fov" | "near" | "far">>;
  rendererFactory?: (options: RendererFactoryOptions) => RendererAdapter;
}

export function createDefaultRenderer({
  container,
  clearColor
}: RendererFactoryOptions): RendererAdapter {
  return new RendererSystem({ container, clearColor });
}
