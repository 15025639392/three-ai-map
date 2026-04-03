import { EventEmitter } from "../utils/EventEmitter";

export class EventBus<TEvents extends object> {
  private readonly emitter = new EventEmitter<TEvents>();

  on<TKey extends keyof TEvents>(
    eventName: TKey,
    handler: (payload: TEvents[TKey]) => void
  ): () => void {
    return this.emitter.on(eventName, handler);
  }

  off<TKey extends keyof TEvents>(
    eventName: TKey,
    handler: (payload: TEvents[TKey]) => void
  ): void {
    this.emitter.off(eventName, handler);
  }

  emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    this.emitter.emit(eventName, payload);
  }
}
