import { TerrariumDecoder, decodeTerrariumPixels } from "../../src/tiles/TerrariumDecoder";

interface FakeWorkerMessageEvent<T> {
  data: T;
}

class FakeTerrariumWorker {
  onmessage: ((event: FakeWorkerMessageEvent<{ id: number; buffer: ArrayBuffer }>) => void) | null = null;
  onerror: ((event: { error?: unknown; message: string }) => void) | null = null;

  postMessage(request: {
    id: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
  }): void {
    const pixels = new Uint8ClampedArray(request.buffer);
    const heights = decodeTerrariumPixels(request.width, request.height, pixels);
    this.onmessage?.({
      data: {
        id: request.id,
        buffer: heights.buffer as ArrayBuffer
      }
    });
  }

  terminate(): void {}
}

describe("TerrariumDecoder", () => {
  it("decodes terrarium rgb pixels into elevation meters", () => {
    const pixels = new Uint8ClampedArray([
      128, 0, 0, 255,
      128, 128, 0, 255,
      129, 0, 0, 255,
      130, 0, 0, 255
    ]);
    const heights = decodeTerrariumPixels(2, 2, pixels);

    expect(heights).toEqual(new Float32Array([0, 128, 256, 512]));
  });

  it("tracks worker-hit stats when Worker path is available", async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as typeof globalThis & { Worker: typeof Worker }).Worker =
      FakeTerrariumWorker as unknown as typeof Worker;

    try {
      const decoder = new TerrariumDecoder();
      const heights = await decoder.decode(1, 1, new Uint8ClampedArray([128, 0, 0, 255]));

      expect(heights).toEqual(new Float32Array([0]));
      expect(decoder.getStats()).toEqual({
        requestCount: 1,
        workerHitCount: 1,
        fallbackCount: 0,
        workerHitRate: 1
      });

      decoder.dispose();
    } finally {
      (globalThis as typeof globalThis & { Worker?: typeof Worker }).Worker = originalWorker;
    }
  });

  it("tracks fallback stats when forced to main-thread decode", async () => {
    const originalWorker = globalThis.Worker;
    (globalThis as typeof globalThis & { Worker: typeof Worker }).Worker =
      FakeTerrariumWorker as unknown as typeof Worker;

    try {
      const decoder = new TerrariumDecoder({ forceMainThread: true });
      await decoder.decode(1, 1, new Uint8ClampedArray([128, 0, 0, 255]));
      await decoder.decode(1, 1, new Uint8ClampedArray([128, 128, 0, 255]));

      expect(decoder.getStats()).toEqual({
        requestCount: 2,
        workerHitCount: 0,
        fallbackCount: 2,
        workerHitRate: 0
      });

      decoder.dispose();
    } finally {
      (globalThis as typeof globalThis & { Worker?: typeof Worker }).Worker = originalWorker;
    }
  });
});
