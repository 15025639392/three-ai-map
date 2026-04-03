export interface EngineModule {
  readonly id: string;
  initialize?(): void;
  dispose?(): void;
}
