export interface RequestSchedulerOptions {
  concurrency: number;
  fetcher?: (url: string) => Promise<Response>;
}

export interface ScheduledRequest {
  id: string;
  url: string;
}

export class RequestScheduler {
  private readonly inflight = new Map<string, Promise<Response>>();
  private readonly fetcher: (url: string) => Promise<Response>;

  constructor(private readonly options: RequestSchedulerOptions) {
    void this.options.concurrency;
    this.fetcher = options.fetcher ?? ((url: string) => fetch(url));
  }

  schedule(request: ScheduledRequest): Promise<Response> {
    const existing = this.inflight.get(request.id);

    if (existing) {
      return existing;
    }

    const promise = this.fetcher(request.url).finally(() => {
      this.inflight.delete(request.id);
    });
    this.inflight.set(request.id, promise);
    return promise;
  }
}
