type Subscriber = (deltaTime: number) => void;

export class FrameLoop {
  private subscribers = new Set<Subscriber>();
  private animationFrameId: number | null = null;
  private previousTime = 0;

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  start(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    this.previousTime = performance.now();
    const step = (time: number) => {
      const deltaTime = time - this.previousTime;
      this.previousTime = time;
      this.tick(deltaTime);
      this.animationFrameId = window.requestAnimationFrame(step);
    };

    this.animationFrameId = window.requestAnimationFrame(step);
  }

  stop(): void {
    if (this.animationFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  tick(deltaTime: number): void {
    for (const subscriber of this.subscribers) {
      subscriber(deltaTime);
    }
  }
}
