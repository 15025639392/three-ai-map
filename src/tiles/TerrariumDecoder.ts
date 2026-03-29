import { decodeElevationPixels, type ElevationEncoding } from "./ElevationEncoding";

interface TerrariumDecodeWorkerRequest {
  id: number;
  encoding: ElevationEncoding;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface TerrariumDecodeWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

export interface TerrariumDecoderStats {
  requestCount: number;
  workerHitCount: number;
  fallbackCount: number;
  workerHitRate: number;
}

interface TerrariumDecoderOptions {
  forceMainThread?: boolean;
}

export { decodeTerrariumPixels } from "./ElevationEncoding";

export class TerrariumDecoder {
  private readonly forceMainThread: boolean;
  private worker: Worker | null = null;
  private requestId = 0;
  private requestCount = 0;
  private workerHitCount = 0;
  private fallbackCount = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Float32Array) => void;
    reject: (reason?: unknown) => void;
  }>();

  constructor(options: TerrariumDecoderOptions = {}) {
    this.forceMainThread = options.forceMainThread ?? false;
    this.worker = this.createWorker();
  }

  async decode(
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
    encoding: ElevationEncoding = "terrarium"
  ): Promise<Float32Array> {
    this.requestCount += 1;

    if (!this.worker) {
      this.fallbackCount += 1;
      return decodeElevationPixels(encoding, width, height, pixels);
    }

    this.workerHitCount += 1;
    const id = this.requestId;
    this.requestId += 1;

    return await new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const request: TerrariumDecodeWorkerRequest = {
        id,
        encoding,
        width,
        height,
        buffer: pixels.slice().buffer
      };

      this.worker?.postMessage(request, [request.buffer]);
    });
  }

  getStats(): TerrariumDecoderStats {
    const workerHitRate =
      this.requestCount > 0 ? this.workerHitCount / this.requestCount : 0;

    return {
      requestCount: this.requestCount,
      workerHitCount: this.workerHitCount,
      fallbackCount: this.fallbackCount,
      workerHitRate
    };
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Terrarium decoder disposed"));
    }

    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private createWorker(): Worker | null {
    if (this.forceMainThread || typeof Worker !== "function") {
      return null;
    }

    try {
      const worker = new Worker(new URL("../workers/terrariumDecodeWorker.ts", import.meta.url), {
        type: "module"
      });

      worker.onmessage = (event: MessageEvent<TerrariumDecodeWorkerResponse>) => {
        const pending = this.pending.get(event.data.id);

        if (!pending) {
          return;
        }

        this.pending.delete(event.data.id);
        pending.resolve(new Float32Array(event.data.buffer));
      };

      worker.onerror = (event) => {
        const error = event.error ?? new Error(event.message);

        for (const pending of this.pending.values()) {
          pending.reject(error);
        }

        this.pending.clear();
        worker.terminate();
        this.worker = null;
      };

      return worker;
    } catch {
      return null;
    }
  }
}
