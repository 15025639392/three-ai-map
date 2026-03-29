import "../src/styles.css";
import { TerrariumDecoder, decodeTerrariumPixels } from "../src/tiles/TerrariumDecoder";

interface TerrariumWorkerRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface TerrariumWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

class DeterministicTerrariumWorker {
  onmessage: ((event: MessageEvent<TerrariumWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(_scriptURL: string | URL, _options?: WorkerOptions) {}

  postMessage(message: TerrariumWorkerRequest): void {
    const pixels = new Uint8ClampedArray(message.buffer);
    const heights = decodeTerrariumPixels(message.width, message.height, pixels);
    this.onmessage?.({
      data: {
        id: message.id,
        buffer: heights.buffer as ArrayBuffer
      }
    } as MessageEvent<TerrariumWorkerResponse>);
  }

  terminate(): void {}
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function sumHeights(heights: Float32Array): number {
  let sum = 0;

  for (const value of heights) {
    sum += value;
  }

  return sum;
}

function formatSignature(values: number[]): string {
  return values.map((value) => value.toFixed(2)).join(",");
}

export async function runTerrariumDecodeRegression(
  container: HTMLElement,
  output: HTMLElement
): Promise<void> {
  setStageSize(container, 720, 420);
  container.dataset.phase = "booting";
  container.dataset.workerRequestCount = "";
  container.dataset.workerHitCount = "";
  container.dataset.workerFallbackCount = "";
  container.dataset.workerHitRate = "";
  container.dataset.fallbackRequestCount = "";
  container.dataset.fallbackHitCount = "";
  container.dataset.fallbackCount = "";
  container.dataset.fallbackHitRate = "";
  container.dataset.workerSignature = "";
  container.dataset.fallbackSignature = "";
  output.textContent = "启动中:terrarium-decode-regression";

  const workerHost = window as Window & { Worker: typeof Worker };
  const nativeWorker = workerHost.Worker;
  workerHost.Worker = DeterministicTerrariumWorker as unknown as typeof Worker;
  const workerDecoder = new TerrariumDecoder();
  const fallbackDecoder = new TerrariumDecoder({ forceMainThread: true });
  const samples = [
    new Uint8ClampedArray([
      128, 0, 0, 255,
      128, 128, 0, 255,
      129, 0, 0, 255,
      130, 0, 0, 255
    ]),
    new Uint8ClampedArray([
      127, 255, 0, 255,
      128, 0, 0, 255,
      128, 64, 0, 255,
      128, 128, 0, 255
    ])
  ];

  try {
    const workerChecksums: number[] = [];
    const fallbackChecksums: number[] = [];

    for (const sample of samples) {
      const heights = await workerDecoder.decode(2, 2, sample);
      workerChecksums.push(sumHeights(heights));
    }

    for (const sample of samples) {
      const heights = await fallbackDecoder.decode(2, 2, sample);
      fallbackChecksums.push(sumHeights(heights));
    }

    const workerSignature = formatSignature(workerChecksums);
    const fallbackSignature = formatSignature(fallbackChecksums);

    if (workerSignature !== fallbackSignature) {
      throw new Error(
        `Worker and fallback decode signatures mismatch: ${workerSignature} !== ${fallbackSignature}`
      );
    }

    const workerStats = workerDecoder.getStats();
    const fallbackStats = fallbackDecoder.getStats();

    container.dataset.phase = "after-terrarium";
    container.dataset.workerRequestCount = `${workerStats.requestCount}`;
    container.dataset.workerHitCount = `${workerStats.workerHitCount}`;
    container.dataset.workerFallbackCount = `${workerStats.fallbackCount}`;
    container.dataset.workerHitRate = `${Number(workerStats.workerHitRate.toFixed(4))}`;
    container.dataset.fallbackRequestCount = `${fallbackStats.requestCount}`;
    container.dataset.fallbackHitCount = `${fallbackStats.workerHitCount}`;
    container.dataset.fallbackCount = `${fallbackStats.fallbackCount}`;
    container.dataset.fallbackHitRate = `${Number(fallbackStats.workerHitRate.toFixed(4))}`;
    container.dataset.workerSignature = workerSignature;
    container.dataset.fallbackSignature = fallbackSignature;
    output.textContent =
      `after-terrarium:worker=${workerStats.workerHitCount}/${workerStats.requestCount}:` +
      `fallback=${fallbackStats.fallbackCount}/${fallbackStats.requestCount}`;
  } catch (error) {
    container.dataset.phase = "error";
    output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
  } finally {
    workerDecoder.dispose();
    fallbackDecoder.dispose();
    workerHost.Worker = nativeWorker;
  }
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container");
  }

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="decode-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">启动中:terrarium-decode-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#decode-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    void runTerrariumDecodeRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
