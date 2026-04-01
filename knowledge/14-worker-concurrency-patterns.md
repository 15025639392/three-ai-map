# 14 Worker Concurrency Patterns

## 1. 目标与边界

本章解决Web Worker在地球引擎中的并发处理问题：

1. 如何设计Worker通信协议
2. 如何实现Worker池和负载均衡
3. 如何处理Worker失败和回退

本章聚焦Worker并发模式，不讨论具体业务逻辑。

---

## 2. Web Worker基础

### 2.1 Worker类型

**专用Worker**（Dedicated Worker）：
- 只能被创建它的页面访问
- 适合处理页面特定任务

**共享Worker**（Shared Worker）：
- 可以被多个页面共享
- 适合跨页面数据共享

### 2.2 通信机制

**主线程 -> Worker**：
```typescript
// 主线程
const worker = new Worker('./worker.js');
worker.postMessage({ type: 'task', data: payload });
```

**Worker -> 主线程**：
```typescript
// Worker
self.postMessage({ type: 'result', data: result });
```

---

## 3. Terrarium解码Worker实现

### 3.1 Worker端实现

**terrariumDecodeWorker.ts**：
```typescript
export {};

interface TerrariumDecodeWorkerRequest {
  id: number;
  encoding: "terrarium" | "mapbox";
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface TerrariumDecodeWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

// 解码函数
function decodeTerrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

function decodeMapboxHeight(red: number, green: number, blue: number): number {
  return -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
}

// Worker上下文
const workerContext = self as unknown as {
  onmessage: (event: MessageEvent<TerrariumDecodeWorkerRequest>) => void;
  postMessage: (message: TerrariumDecodeWorkerResponse, transfer: Transferable[]) => void;
};

// 消息处理
workerContext.onmessage = (event: MessageEvent<TerrariumDecodeWorkerRequest>) => {
  const { id, encoding, width, height, buffer } = event.data;
  const pixels = new Uint8ClampedArray(buffer);
  const heights = new Float32Array(width * height);

  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    heights[index] = encoding === "mapbox"
      ? decodeMapboxHeight(r, g, b)
      : decodeTerrariumHeight(r, g, b);
  }

  const response: TerrariumDecodeWorkerResponse = {
    id,
    buffer: heights.buffer
  };

  // 使用Transferable传输ArrayBuffer
  workerContext.postMessage(response, [response.buffer]);
};
```

### 3.2 主线程调用

```typescript
class TerrariumDecoder {
  private worker: Worker;
  private pendingRequests: Map<number, {
    resolve: (value: Float32Array) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private nextId = 0;

  constructor() {
    this.worker = new Worker('./terrariumDecodeWorker.ts');
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  async decode(
    buffer: ArrayBuffer,
    width: number,
    height: number,
    encoding: "terrarium" | "mapbox"
  ): Promise<Float32Array> {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        id,
        encoding,
        width,
        height,
        buffer
      }, [buffer]);  // Transfer ArrayBuffer
    });
  }

  private handleMessage(event: MessageEvent<TerrariumDecodeWorkerResponse>) {
    const { id, buffer } = event.data;
    const request = this.pendingRequests.get(id);

    if (request) {
      this.pendingRequests.delete(id);
      request.resolve(new Float32Array(buffer));
    }
  }

  private handleError(error: ErrorEvent) {
    console.error('Worker error:', error);
    // 拒绝所有待处理请求
    for (const [id, request] of this.pendingRequests) {
      request.reject(new Error(`Worker error: ${error.message}`));
    }
    this.pendingRequests.clear();
  }

  dispose(): void {
    this.worker.terminate();
    this.pendingRequests.clear();
  }
}
```

---

## 4. Worker池设计

### 4.1 Worker池实现

```typescript
class WorkerPool<TRequest, TResponse> {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private taskQueue: Array<{
    request: TRequest;
    resolve: (value: TResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private workerTaskMap: Map<Worker, {
    resolve: (value: TResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(
    private workerScript: string,
    private poolSize: number = navigator.hardwareConcurrency || 4
  ) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerScript);
      worker.onmessage = this.handleWorkerMessage.bind(this, worker);
      worker.onerror = this.handleWorkerError.bind(this, worker);
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }
  }

  async execute(request: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const worker = this.idleWorkers.pop();

      if (worker) {
        // 有空闲Worker，立即执行
        this.workerTaskMap.set(worker, { resolve, reject });
        worker.postMessage(request);
      } else {
        // 没有空闲Worker，加入队列
        this.taskQueue.push({ request, resolve, reject });
      }
    });
  }

  private handleWorkerMessage(worker: Worker, event: MessageEvent<TResponse>) {
    const task = this.workerTaskMap.get(worker);
    if (task) {
      this.workerTaskMap.delete(worker);
      task.resolve(event.data);
      this.returnWorker(worker);
    }
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent) {
    const task = this.workerTaskMap.get(worker);
    if (task) {
      this.workerTaskMap.delete(worker);
      task.reject(new Error(`Worker error: ${error.message}`));
      this.returnWorker(worker);
    }
  }

  private returnWorker(worker: Worker): void {
    // 检查队列是否有待处理任务
    if (this.taskQueue.length > 0) {
      const { request, resolve, reject } = this.taskQueue.shift()!;
      this.workerTaskMap.set(worker, { resolve, reject });
      worker.postMessage(request);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = [];
    this.workerTaskMap.clear();
  }
}
```

### 4.2 使用示例

```typescript
// 创建Worker池
const decoderPool = new WorkerPool<ArrayBuffer, Float32Array>(
  './terrariumDecodeWorker.js',
  4  // 4个Worker
);

// 并行解码多个瓦片
async function decodeMultipleTiles(tiles: TileData[]): Promise<Float32Array[]> {
  const promises = tiles.map(tile => 
    decoderPool.execute(tile.buffer)
  );
  
  return Promise.all(promises);
}
```

---

## 5. 负载均衡策略

### 5.1 轮询调度

```typescript
class RoundRobinScheduler {
  private currentIndex = 0;

  selectWorker(workers: Worker[]): Worker {
    const worker = workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % workers.length;
    return worker;
  }
}
```

### 5.2 最少任务调度

```typescript
class LeastTaskScheduler {
  selectWorker(workers: Worker[], taskCounts: Map<Worker, number>): Worker {
    let minTasks = Infinity;
    let selectedWorker = workers[0];

    for (const worker of workers) {
      const count = taskCounts.get(worker) || 0;
      if (count < minTasks) {
        minTasks = count;
        selectedWorker = worker;
      }
    }

    return selectedWorker;
  }
}
```

---

## 6. 错误处理与回退

### 6.1 Worker失败检测

```typescript
class WorkerManager {
  private workers: Worker[] = [];
  private healthCheckInterval: number | null = null;

  startHealthCheck(): void {
    this.healthCheckInterval = window.setInterval(() => {
      this.checkWorkerHealth();
    }, 5000);
  }

  private checkWorkerHealth(): void {
    for (const worker of this.workers) {
      try {
        // 发送健康检查消息
        worker.postMessage({ type: 'health-check' });
      } catch (error) {
        // Worker已终止，需要替换
        this.replaceWorker(worker);
      }
    }
  }

  private replaceWorker(failedWorker: Worker): void {
    const index = this.workers.indexOf(failedWorker);
    if (index !== -1) {
      failedWorker.terminate();
      this.workers[index] = new Worker('./worker.js');
    }
  }
}
```

### 6.2 主线程回退

```typescript
class TerrariumDecoderWithFallback {
  private workerPool: WorkerPool<ArrayBuffer, Float32Array>;
  private workerAvailable = true;

  constructor() {
    try {
      this.workerPool = new WorkerPool('./terrariumDecodeWorker.js', 4);
    } catch (error) {
      console.warn('Worker not available, using main thread fallback');
      this.workerAvailable = false;
    }
  }

  async decode(
    buffer: ArrayBuffer,
    width: number,
    height: number,
    encoding: "terrarium" | "mapbox"
  ): Promise<Float32Array> {
    if (this.workerAvailable) {
      try {
        return await this.workerPool.execute(buffer);
      } catch (error) {
        console.warn('Worker failed, falling back to main thread');
        this.workerAvailable = false;
      }
    }

    // 主线程回退
    return this.decodeOnMainThread(buffer, width, height, encoding);
  }

  private decodeOnMainThread(
    buffer: ArrayBuffer,
    width: number,
    height: number,
    encoding: "terrarium" | "mapbox"
  ): Float32Array {
    const pixels = new Uint8ClampedArray(buffer);
    const heights = new Float32Array(width * height);

    for (let index = 0; index < heights.length; index += 1) {
      const offset = index * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      
      if (encoding === "mapbox") {
        heights[index] = -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
      } else {
        heights[index] = r * 256 + g + b / 256 - 32768;
      }
    }

    return heights;
  }
}
```

---

## 7. 性能优化

### 7.1 数据传输优化

**使用Transferable**：
```typescript
// 不好的做法：复制ArrayBuffer
worker.postMessage({ buffer: arrayBuffer });

// 好的做法：传输ArrayBuffer
worker.postMessage({ buffer: arrayBuffer }, [arrayBuffer]);
```

**批量处理**：
```typescript
// 不好的做法：多次发送小数据
for (const tile of tiles) {
  worker.postMessage(tile);
}

// 好的做法：批量发送
worker.postMessage(tiles);
```

### 7.2 Worker数量优化

```typescript
// 根据CPU核心数设置Worker数量
const workerCount = navigator.hardwareConcurrency || 4;
const workerPool = new WorkerPool('./worker.js', workerCount);
```

---

## 8. 实际应用示例

### 8.1 图像处理Worker

```typescript
// imageProcessWorker.ts
self.onmessage = (event: MessageEvent<{
  id: number;
  imageData: ImageData;
  operation: 'blur' | 'sharpen' | 'grayscale';
}>) => {
  const { id, imageData, operation } = event.data;
  
  let result: ImageData;
  switch (operation) {
    case 'blur':
      result = applyBlur(imageData);
      break;
    case 'sharpen':
      result = applySharpen(imageData);
      break;
    case 'grayscale':
      result = applyGrayscale(imageData);
      break;
  }
  
  self.postMessage({ id, imageData: result }, [result.data.buffer]);
};
```

### 8.2 空间计算Worker

```typescript
// spatialWorker.ts
self.onmessage = (event: MessageEvent<{
  id: number;
  points: Float64Array;
  operation: 'convex-hull' | 'delaunay';
}>) => {
  const { id, points, operation } = event.data;
  
  let result: Float64Array;
  switch (operation) {
    case 'convex-hull':
      result = computeConvexHull(points);
      break;
    case 'delaunay':
      result = computeDelaunayTriangulation(points);
      break;
  }
  
  self.postMessage({ id, result }, [result.buffer]);
};
```

---

## 9. 调试技巧

### 9.1 Worker调试

**Chrome DevTools**：
1. 打开DevTools
2. 切换到Sources面板
3. 在左侧找到Workers列表
4. 选择要调试的Worker

**日志输出**：
```typescript
// Worker中
console.log('Worker started');
console.time('decode');
// ... 处理逻辑
console.timeEnd('decode');
```

### 9.2 性能分析

```typescript
class WorkerProfiler {
  private metrics: Map<string, {
    count: number;
    totalTime: number;
  }> = new Map();

  record(taskType: string, duration: number): void {
    if (!this.metrics.has(taskType)) {
      this.metrics.set(taskType, { count: 0, totalTime: 0 });
    }
    
    const metric = this.metrics.get(taskType)!;
    metric.count++;
    metric.totalTime += duration;
  }

  getReport(): string {
    let report = 'Worker Performance Report:\n';
    for (const [taskType, metric] of this.metrics) {
      const avgTime = metric.totalTime / metric.count;
      report += `${taskType}: ${metric.count} tasks, avg ${avgTime.toFixed(2)}ms\n`;
    }
    return report;
  }
}
```

---

## 10. 验收清单

满足以下项可认为Worker实现达标：

1. [ ] Worker通信协议清晰
2. [ ] Worker池大小合理
3. [ ] 负载均衡有效
4. [ ] 错误处理和回退机制完善
5. [ ] 性能优于主线程处理
6. [ ] 内存使用合理

---

## 11. 参考源码

- `src/workers/terrariumDecodeWorker.ts` - Terrarium解码Worker
- `src/tiles/TerrariumDecoder.ts` - Worker调用封装
- `src/tiles/TileScheduler.ts` - 并发调度

---

## 12. 下一步行动

1. 实现更多类型的Worker（图像处理、空间计算）
2. 优化Worker池管理
3. 添加Worker性能监控
4. 实现Worker动态扩缩容