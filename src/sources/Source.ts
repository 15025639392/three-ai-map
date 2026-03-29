import type { LayerRecoveryOverrides, LayerRecoveryQuery } from "../layers/Layer";

export interface SourceContext {
  requestRender?: () => void;
  resolveRecovery?: (query: LayerRecoveryQuery) => LayerRecoveryOverrides | undefined;
}

export interface Source {
  readonly id: string;
  onAdd?(context: SourceContext): void;
  onRemove?(): void;
  dispose?(): void;
}

