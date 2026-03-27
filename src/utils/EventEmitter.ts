type Handler<T> = (payload: T) => void;

export class EventEmitter<TEvents extends object> {
  private handlers = new Map<keyof TEvents, Set<Handler<any>>>();

  on<TKey extends keyof TEvents>(eventName: TKey, handler: Handler<TEvents[TKey]>): () => void {
    const handlers = this.handlers.get(eventName) ?? new Set();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);

    return () => {
      handlers.delete(handler);

      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    };
  }

  off<TKey extends keyof TEvents>(eventName: TKey, handler: Handler<TEvents[TKey]>): void {
    const handlers = this.handlers.get(eventName);

    if (!handlers) {
      return;
    }

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.handlers.delete(eventName);
    }
  }

  emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    const handlers = this.handlers.get(eventName);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}
