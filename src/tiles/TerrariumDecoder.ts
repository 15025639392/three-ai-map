interface TerrariumDecodeWorkerRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface TerrariumDecodeWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

function decodeTerrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

export function decodeTerrariumPixels(width: number, height: number, pixels: Uint8ClampedArray): Float32Array {
  const heights = new Float32Array(width * height);

  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    heights[index] = decodeTerrariumHeight(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }

  return heights;
}

export class TerrariumDecoder {
  private worker: Worker | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, {
    resolve: (value: Float32Array) => void;
    reject: (reason?: unknown) => void;
  }>();

  constructor() {
    this.worker = this.createWorker();
  }

  async decode(width: number, height: number, pixels: Uint8ClampedArray): Promise<Float32Array> {
    if (!this.worker) {
      return decodeTerrariumPixels(width, height, pixels);
    }

    const id = this.requestId;
    this.requestId += 1;

    return await new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const request: TerrariumDecodeWorkerRequest = {
        id,
        width,
        height,
        buffer: pixels.slice().buffer
      };

      this.worker?.postMessage(request, [request.buffer]);
    });
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
    if (typeof Worker !== "function") {
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
