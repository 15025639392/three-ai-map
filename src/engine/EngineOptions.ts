import { Camera, PerspectiveCamera, Scene } from "three";
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

export function createDefaultRenderer({
  container,
  clearColor
}: RendererFactoryOptions): RendererAdapter {
  return new RendererSystem({ container, clearColor });
}
