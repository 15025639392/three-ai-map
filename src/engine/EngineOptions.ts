import { Camera, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { RendererSystem } from "../scene/RendererSystem";
import type {
  LayerErrorCategory,
  LayerErrorSeverity,
  LayerRecoveryOverrides
} from "../layers/Layer";

export interface EngineView {
  lng: number;
  lat: number;
  altitude: number;
  heading?: number;
  pitch?: number;
  roll?: number;
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
  showDebugOverlay?: boolean;
  camera?: Partial<Pick<PerspectiveCamera, "fov" | "near" | "far">>;
  recoveryPolicy?: GlobeEngineRecoveryPolicy;
  rendererFactory?: (options: RendererFactoryOptions) => RendererAdapter;
}

export function createDefaultRenderer({
  container,
  clearColor
}: RendererFactoryOptions): RendererAdapter {
  return new RendererSystem({ container, clearColor });
}
