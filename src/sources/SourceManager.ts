import type { Source, SourceContext } from "./Source";

export class SourceManager {
  private readonly sources = new Map<string, Source>();
  private readonly context: SourceContext;

  constructor(context: SourceContext) {
    this.context = context;
  }

  add(id: string, source: Source): void {
    if (this.sources.has(id)) {
      throw new Error(`Source "${id}" already exists`);
    }

    if (source.id !== id) {
      throw new Error(`Source id mismatch: expected "${id}", got "${source.id}"`);
    }

    this.sources.set(id, source);
    source.onAdd?.(this.context);
  }

  remove(id: string): void {
    const source = this.sources.get(id);

    if (!source) {
      return;
    }

    source.onRemove?.();
    source.dispose?.();
    this.sources.delete(id);
  }

  get(id: string): Source | undefined {
    return this.sources.get(id);
  }

  clear(): void {
    for (const id of [...this.sources.keys()]) {
      this.remove(id);
    }
  }
}

