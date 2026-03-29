import { TileScheduler } from "../../src/tiles/TileScheduler";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("TileScheduler", () => {
  it("deduplicates in-flight requests for the same tile key", async () => {
    const loader = vi.fn(async () => "tile");
    const scheduler = new TileScheduler<string>({
      concurrency: 2,
      loadTile: loader
    });

    const [first, second] = await Promise.all([
      scheduler.request("1/2/3", { z: 1, x: 2, y: 3 }),
      scheduler.request("1/2/3", { z: 1, x: 2, y: 3 })
    ]);

    expect(first).toBe("tile");
    expect(second).toBe("tile");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued request by key", async () => {
    const activeDeferred = createDeferred<string>();
    const scheduler = new TileScheduler<string, { id: string }>({
      concurrency: 1,
      loadTile: vi.fn(async ({ id }) => {
        if (id === "active") {
          return activeDeferred.promise;
        }

        return id;
      })
    });
    const typedScheduler = scheduler as TileScheduler<string, { id: string }> & {
      cancel: (key: string) => void;
    };

    const first = scheduler.request("0/0/0", { id: "active" });
    const second = scheduler.request("0/0/1", { id: "queued" });

    typedScheduler.cancel("0/0/1");
    activeDeferred.resolve("tile");

    await expect(first).resolves.toBe("tile");
    await expect(second).rejects.toThrow("0/0/1");
  });

  it("aborts an active request when cancelled by key", async () => {
    const scheduler = new TileScheduler<string, { id: string }>({
      concurrency: 1,
      loadTile: vi.fn(
        (_payload, signal?: AbortSignal) =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true }
            );
          })
      )
    });
    const typedScheduler = scheduler as TileScheduler<string, { id: string }> & {
      cancel: (key: string) => void;
    };

    const request = scheduler.request("0/0/0", { id: "active" });
    typedScheduler.cancel("0/0/0");

    await expect(request).rejects.toThrow("0/0/0");
  });

  it("aborts active work and rejects queued requests when clear() is called", async () => {
    const loader = vi.fn(
      (_payload: { id: string }, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true }
          );
        })
    );
    const scheduler = new TileScheduler<string, { id: string }>({
      concurrency: 1,
      loadTile: loader
    });

    const first = scheduler.request("0/0/0", { id: "first" });
    const second = scheduler.request("0/0/1", { id: "second" });

    scheduler.clear();

    await expect(first).rejects.toThrow("TileScheduler cleared");
    await expect(second).rejects.toThrow("TileScheduler cleared");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("starts higher-priority queued work before lower-priority work", async () => {
    const firstDeferred = createDeferred<string>();
    const started: string[] = [];
    const scheduler = new TileScheduler<string, { id: string }>({
      concurrency: 1,
      loadTile: vi.fn(async ({ id }) => {
        started.push(id);

        if (id === "first") {
          return firstDeferred.promise;
        }

        return id;
      })
    });
    const typedScheduler = scheduler as TileScheduler<string, { id: string }> & {
      request: (
        key: string,
        payload: { id: string },
        options?: { priority?: number }
      ) => Promise<string>;
    };

    const first = scheduler.request("0/0/0", { id: "first" });
    const low = typedScheduler.request("0/0/1", { id: "low" }, { priority: 1 });
    const high = typedScheduler.request("0/0/2", { id: "high" }, { priority: 10 });

    firstDeferred.resolve("first");

    await expect(first).resolves.toBe("first");
    await expect(high).resolves.toBe("high");
    await expect(low).resolves.toBe("low");
    expect(started).toEqual(["first", "high", "low"]);
  });

  it("reports request lifecycle statistics", async () => {
    const activeDeferred = createDeferred<string>();
    const scheduler = new TileScheduler<string, { id: string }>({
      concurrency: 1,
      loadTile: vi.fn(async ({ id }, signal?: AbortSignal) => {
        if (id === "active") {
          return new Promise<string>((resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true }
            );
            void activeDeferred.promise.then(resolve);
          });
        }

        return id;
      })
    });
    const typedScheduler = scheduler as TileScheduler<string, { id: string }> & {
      cancel: (key: string) => void;
      getStats: () => {
        requested: number;
        started: number;
        succeeded: number;
        cancelled: number;
        deduplicated: number;
        active: number;
        queued: number;
      };
    };

    const first = scheduler.request("0/0/0", { id: "active" });
    const duplicate = scheduler.request("0/0/0", { id: "active" });
    const queued = scheduler.request("0/0/1", { id: "queued" });

    typedScheduler.cancel("0/0/1");
    activeDeferred.resolve("done");

    await expect(first).resolves.toBe("done");
    await expect(duplicate).resolves.toBe("done");
    await expect(queued).rejects.toThrow("0/0/1");

    expect(typedScheduler.getStats()).toMatchObject({
      requested: 3,
      started: 1,
      succeeded: 1,
      cancelled: 1,
      deduplicated: 1,
      active: 0,
      queued: 0
    });
  });
});
