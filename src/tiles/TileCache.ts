export class TileCache<TValue> {
  private readonly capacity: number;
  private readonly items = new Map<string, TValue>();

  constructor(capacity: number) {
    this.capacity = capacity;
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

    const oldestKey = this.items.keys().next().value;

    if (oldestKey) {
      this.items.delete(oldestKey);
    }
  }

  clear(): void {
    this.items.clear();
  }
}
