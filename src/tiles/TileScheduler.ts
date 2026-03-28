interface TileSchedulerOptions<TValue, TPayload> {
  concurrency: number;
  loadTile: (payload: TPayload) => Promise<TValue>;
}

interface QueuedRequest<TValue, TPayload> {
  key: string;
  payload: TPayload;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

export class TileScheduler<TValue, TPayload = unknown> {
  private readonly concurrency: number;
  private readonly loadTile: (payload: TPayload) => Promise<TValue>;
  private readonly inflight = new Map<string, Promise<TValue>>();
  private readonly queue: Array<QueuedRequest<TValue, TPayload>> = [];
  private activeCount = 0;

  constructor({ concurrency, loadTile }: TileSchedulerOptions<TValue, TPayload>) {
    this.concurrency = concurrency;
    this.loadTile = loadTile;
  }

  request(key: string, payload: TPayload): Promise<TValue> {
    const existing = this.inflight.get(key);

    if (existing) {
      return existing;
    }

    const promise = new Promise<TValue>((resolve, reject) => {
      this.queue.push({
        key,
        payload,
        resolve,
        reject
      });
      this.processQueue();
    });

    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    const error = new Error("TileScheduler cleared");
    for (const request of this.queue) {
      request.reject(error);
    }
    this.queue.length = 0;
    this.inflight.clear();
    this.activeCount = 0;
  }

  private processQueue(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const request = this.queue.shift();

      if (!request) {
        return;
      }

      this.activeCount += 1;
      this.loadTile(request.payload)
        .then((value) => {
          request.resolve(value);
        })
        .catch((error) => {
          request.reject(error);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.inflight.delete(request.key);
          this.processQueue();
        });
    }
  }
}
