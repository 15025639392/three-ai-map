export class TileCache<T> {
  private readonly cache = new Map<string, T>();

  get(key: string): T | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, value: T): void {
    this.cache.set(key, value);
  }

  evict(key: string): void {
    this.cache.delete(key);
  }
}
