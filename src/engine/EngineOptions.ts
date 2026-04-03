import { Camera, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { RendererSystem } from "../core/RendererSystem";
import type {
  LayerErrorCategory,
  LayerErrorSeverity,
  LayerRecoveryOverrides
} from "../layers/Layer";

export interface EngineView {
  lng: number;
  lat: number;
  altitude: number;
}

export interface RendererAdapter {
  renderer: {
    domElement: HTMLCanvasElement;
  };
  getWebGLRenderer?(): WebGLRenderer | null;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export interface RendererFactoryOptions {
  container: HTMLElement;
  clearColor?: string;
}

export interface GlobeEngineRecoveryRule {
  layerId?: string;
  stage?: string;
  category?: LayerErrorCategory;
  severity?: LayerErrorSeverity;
  overrides: LayerRecoveryOverrides;
}

export interface GlobeEngineRecoveryPolicy {
  defaults?: LayerRecoveryOverrides;
  rules?: GlobeEngineRecoveryRule[];
}

export interface GlobeEngineOptions {
  container: HTMLElement;
  radius?: number;
  background?: string;
  showBaseGlobe?: boolean;
  showInteractionAnchor?: boolean;
  camera?: Partial<Pick<PerspectiveCamera, "fov" | "near" | "far">>;
  recoveryPolicy?: GlobeEngineRecoveryPolicy;
  rendererFactory?: (options: RendererFactoryOptions) => RendererAdapter;
}

function createHeadlessRenderer({
  container,
  clearColor = "#03060d"
}: RendererFactoryOptions): RendererAdapter {
  const canvas = document.createElement("canvas");
  canvas.dataset.rendererMode = "headless";
  canvas.style.background = clearColor;
  container.appendChild(canvas);

  return {
    renderer: {
      domElement: canvas
    },
    getWebGLRenderer(): WebGLRenderer | null {
      return null;
    },
    setSize(width: number, height: number): void {
      canvas.width = Math.max(1, Math.floor(width));
      canvas.height = Math.max(1, Math.floor(height));
      canvas.style.width = `${Math.max(1, width)}px`;
      canvas.style.height = `${Math.max(1, height)}px`;
    },
    render(_scene: Scene, _camera: Camera): void {
      // Test environments without WebGL still need a stable engine entrypoint.
    },
    dispose(): void {
      canvas.remove();
    }
  };
}

function canUseWebGL(): boolean {
  return typeof window !== "undefined" && "WebGLRenderingContext" in window;
}

export function createDefaultRenderer({
  container,
  clearColor
}: RendererFactoryOptions): RendererAdapter {
  if (!canUseWebGL()) {
    return createHeadlessRenderer({ container, clearColor });
  }

  return new RendererSystem({ container, clearColor });
}
