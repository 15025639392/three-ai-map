export interface TileCacheOptions<TValue = unknown> {
  onEvict?: (key: string, value: TValue) => void;
}

export class TileCache<TValue> {
  private readonly capacity: number;
  private readonly onEvict: ((key: string, value: TValue) => void) | undefined;
  private readonly items = new Map<string, TValue>();

  constructor(capacity: number, options?: TileCacheOptions<TValue>) {
    this.capacity = capacity;
    this.onEvict = options?.onEvict;
  }

  get(key: string): TValue | undefined {
    const value = this.items.get(key);

    if (value === undefined) {
      return undefined;
    }

    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  set(key: string, value: TValue): void {
    if (this.items.has(key)) {
      this.items.delete(key);
    }

    this.items.set(key, value);

    if (this.items.size <= this.capacity) {
      return;
    }

    while (this.items.size > this.capacity) {
      const oldestKey = this.items.keys().next().value;

      if (!oldestKey) {
        break;
      }

      const evictedValue = this.items.get(oldestKey);
      this.items.delete(oldestKey);

      if (this.onEvict && evictedValue !== undefined) {
        this.onEvict(oldestKey, evictedValue);
      }
    }
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, value] of this.items) {
        this.onEvict(key, value);
      }
    }
    this.items.clear();
  }
}
