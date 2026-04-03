import type { EngineModule } from "../engine/EngineModule";

export class ModuleRegistry<TModule extends EngineModule = EngineModule> {
  private readonly modules = new Map<string, TModule>();

  register(module: TModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module "${module.id}" already registered`);
    }

    this.modules.set(module.id, module);
    module.initialize?.();
  }

  get(id: string): TModule | undefined {
    return this.modules.get(id);
  }

  unregister(id: string): void {
    const module = this.modules.get(id);

    if (!module) {
      return;
    }

    module.dispose?.();
    this.modules.delete(id);
  }

  clear(): void {
    for (const module of this.modules.values()) {
      module.dispose?.();
    }

    this.modules.clear();
  }

  values(): TModule[] {
    return [...this.modules.values()];
  }
}
