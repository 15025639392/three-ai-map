interface TileSchedulerOptions<TValue, TPayload> {
  concurrency: number;
  maxQueueSize?: number;
  agingFactor?: number;
  loadTile: (payload: TPayload, signal?: AbortSignal) => Promise<TValue>;
}

export interface TileRequestOptions {
  priority?: number;
}

export interface TileSchedulerStats {
  requested: number;
  deduplicated: number;
  started: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  active: number;
  queued: number;
}

export class TileRequestCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

interface QueuedRequest<TValue, TPayload> {
  key: string;
  payload: TPayload;
  priority: number;
  order: number;
  state: "queued" | "active";
  controller: AbortController;
  promise: Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

export class TileScheduler<TValue, TPayload = unknown> {
  private readonly concurrency: number;
  private readonly maxQueueSize: number;
  private readonly agingFactor: number;
  private readonly loadTile: (payload: TPayload, signal?: AbortSignal) => Promise<TValue>;
  private readonly inflight = new Map<string, QueuedRequest<TValue, TPayload>>();
  private readonly queue: Array<QueuedRequest<TValue, TPayload>> = [];
  private activeCount = 0;
  private nextOrder = 0;
  private requestedCount = 0;
  private deduplicatedCount = 0;
  private startedCount = 0;
  private succeededCount = 0;
  private failedCount = 0;
  private cancelledCount = 0;

  constructor({ concurrency, maxQueueSize, agingFactor, loadTile }: TileSchedulerOptions<TValue, TPayload>) {
    const resolvedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1;
    this.concurrency = Math.max(1, resolvedConcurrency);
    this.maxQueueSize = Number.isFinite(maxQueueSize)
      ? Math.max(1, Math.floor(maxQueueSize ?? 1))
      : Number.POSITIVE_INFINITY;
    this.agingFactor = Number.isFinite(agingFactor)
      ? Math.max(0, agingFactor ?? 0)
      : 0;
    this.loadTile = loadTile;
  }

  request(key: string, payload: TPayload, options: TileRequestOptions = {}): Promise<TValue> {
    this.requestedCount += 1;
    const existing = this.inflight.get(key);

    if (existing) {
      this.deduplicatedCount += 1;

      if (existing.state === "queued") {
        existing.payload = payload;
        const nextPriority = options.priority ?? existing.priority;

        if (existing.priority !== nextPriority) {
          existing.priority = nextPriority;
          this.sortQueue();
          this.trimQueue();
        }
      }

      return existing.promise;
    }

    let resolveRequest!: (value: TValue) => void;
    let rejectRequest!: (error: unknown) => void;
    const promise = new Promise<TValue>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });

    const request: QueuedRequest<TValue, TPayload> = {
      key,
      payload,
      priority: options.priority ?? 0,
      order: this.nextOrder++,
      state: "queued",
      controller: new AbortController(),
      promise,
      resolve: resolveRequest,
      reject: rejectRequest
    };

    this.inflight.set(key, request);
    this.queue.push(request);
    this.sortQueue();
    this.trimQueue();
    this.processQueue();
    return promise;
  }

  cancel(key: string): boolean {
    const request = this.inflight.get(key);

    if (!request) {
      return false;
    }

    const error = new TileRequestCancelledError(`TileScheduler cancelled ${key}`);
    this.inflight.delete(key);

    if (request.state === "queued") {
      this.removeFromQueue(request);
      this.cancelledCount += 1;
      queueMicrotask(() => {
        request.reject(error);
      });
      return true;
    }

    request.controller.abort(error);
    return true;
  }

  clear(): void {
    const error = new TileRequestCancelledError("TileScheduler cleared");

    for (const request of [...this.queue]) {
      this.inflight.delete(request.key);
      this.cancelledCount += 1;
      queueMicrotask(() => {
        request.reject(error);
      });
    }

    this.queue.length = 0;

    for (const request of this.inflight.values()) {
      request.controller.abort(error);
    }

    this.inflight.clear();
  }

  private processQueue(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const request = this.queue.shift();

      if (!request) {
        return;
      }

      if (!this.inflight.has(request.key) || request.controller.signal.aborted) {
        continue;
      }

      request.state = "active";
      this.activeCount += 1;
      this.startedCount += 1;
      this.loadTile(request.payload, request.controller.signal)
        .then((value) => {
          if (request.controller.signal.aborted) {
            throw this.getAbortReason(request);
          }

          this.succeededCount += 1;
          request.resolve(value);
        })
        .catch((error) => {
          if (request.controller.signal.aborted) {
            this.cancelledCount += 1;
          } else {
            this.failedCount += 1;
          }

          request.reject(this.normalizeError(request, error));
        })
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);

          if (this.inflight.get(request.key) === request) {
            this.inflight.delete(request.key);
          }

          this.processQueue();
        });
    }
  }

  private sortQueue(): void {
    this.queue.sort((left, right) => {
      const leftPriority = this.getEffectivePriority(left);
      const rightPriority = this.getEffectivePriority(right);

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return left.order - right.order;
    });
  }

  private getEffectivePriority(request: QueuedRequest<TValue, TPayload>): number {
    if (this.agingFactor <= 0) {
      return request.priority;
    }

    const waitedRequests = this.nextOrder - request.order;
    return request.priority + waitedRequests / this.agingFactor;
  }

  private trimQueue(): void {
    if (!Number.isFinite(this.maxQueueSize) || this.queue.length <= this.maxQueueSize) {
      return;
    }

    while (this.queue.length > this.maxQueueSize) {
      const dropped = this.queue.pop();

      if (!dropped) {
        break;
      }

      this.inflight.delete(dropped.key);
      this.cancelledCount += 1;
      const error = new TileRequestCancelledError(
        `TileScheduler dropped ${dropped.key} due to queue saturation`
      );
      queueMicrotask(() => {
        dropped.reject(error);
      });
    }
  }

  private removeFromQueue(request: QueuedRequest<TValue, TPayload>): void {
    const queueIndex = this.queue.indexOf(request);

    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }
  }

  private getAbortReason(request: QueuedRequest<TValue, TPayload>): Error {
    const reason = request.controller.signal.reason;

    if (reason instanceof Error) {
      return reason;
    }

    if (typeof reason === "string") {
      return new TileRequestCancelledError(reason);
    }

    return new TileRequestCancelledError(`TileScheduler cancelled ${request.key}`);
  }

  private normalizeError(request: QueuedRequest<TValue, TPayload>, error: unknown): unknown {
    if (request.controller.signal.aborted) {
      return this.getAbortReason(request);
    }

    return error;
  }

  getStats(): TileSchedulerStats {
    return {
      requested: this.requestedCount,
      deduplicated: this.deduplicatedCount,
      started: this.startedCount,
      succeeded: this.succeededCount,
      failed: this.failedCount,
      cancelled: this.cancelledCount,
      active: this.activeCount,
      queued: this.queue.length
    };
  }
}
