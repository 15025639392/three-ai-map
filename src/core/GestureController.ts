export interface TouchPoint {
  clientX: number;
  clientY: number;
}

export interface TouchEventLike {
  touches: TouchPoint[];
  timeStamp: number;
}

export interface GestureEvent {
  type: string;
  touches: TouchPoint[];
  delta?: { x: number; y: number };
  scale?: number;
  angle?: number;
}

export type GestureEventHandler = (event: GestureEvent) => void;

export class GestureController {
  private eventHandlers: Map<string, GestureEventHandler[]> = new Map();
  private lastTouches: TouchPoint[] = [];
  private currentTouches: TouchPoint[] = [];
  private initialTouchDistance: number = 0;
  private initialTouchAngle: number = 0;
  
  on(event: string, handler: GestureEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }
  
  off(event: string, handler: GestureEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(event, handlers);
    }
  }
  
  handleTouchStart(event: TouchEventLike): void {
    this.currentTouches = event.touches;
    this.lastTouches = [...event.touches];
    
    if (event.touches.length === 2) {
      this.initialTouchDistance = this.calculateDistance(event.touches[0], event.touches[1]);
      this.initialTouchAngle = this.calculateAngle(event.touches[0], event.touches[1]);
    }
    
    this.emit('touchStart', {
      type: 'touchStart',
      touches: event.touches
    });
  }
  
  handleTouchMove(event: TouchEventLike): void {
    if (this.currentTouches.length === 0) return;
    
    const delta = this.calculateDelta(this.currentTouches, event.touches);
    
    this.lastTouches = [...this.currentTouches];
    this.currentTouches = event.touches;
    
    if (event.touches.length === 2) {
      const distance = this.calculateDistance(event.touches[0], event.touches[1]);
      const angle = this.calculateAngle(event.touches[0], event.touches[1]);
      
      const scale = distance / this.initialTouchDistance;
      const angleDelta = angle - this.initialTouchAngle;
      
      if (Math.abs(scale - 1) > 0.1) {
        this.emit('pinch', {
          type: 'pinch',
          touches: event.touches,
          scale
        });
      }
      
      if (Math.abs(angleDelta) > 0.1) {
        this.emit('rotate', {
          type: 'rotate',
          touches: event.touches,
          angle: angleDelta
        });
      }
    } else if (event.touches.length === 1) {
      if (delta.x !== 0 || delta.y !== 0) {
        this.emit('pan', {
          type: 'pan',
          touches: event.touches,
          delta
        });
      }
    }
    
    this.emit('touchMove', {
      type: 'touchMove',
      touches: event.touches,
      delta
    });
  }
  
  handleTouchEnd(event: TouchEventLike): void {
    this.currentTouches = event.touches;
    
    if (event.touches.length === 0) {
      this.initialTouchDistance = 0;
      this.initialTouchAngle = 0;
    }
    
    this.emit('touchEnd', {
      type: 'touchEnd',
      touches: event.touches
    });
  }
  
  getPinchScale(): number {
    if (this.currentTouches.length !== 2) return 1;
    
    const distance = this.calculateDistance(this.currentTouches[0], this.currentTouches[1]);
    return distance / this.initialTouchDistance;
  }
  
  getRotationAngle(): number {
    if (this.currentTouches.length !== 2) return 0;
    
    const angle = this.calculateAngle(this.currentTouches[0], this.currentTouches[1]);
    return angle - this.initialTouchAngle;
  }
  
  private emit(event: string, gestureEvent: GestureEvent): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(gestureEvent));
  }
  
  private calculateDistance(touch1: TouchPoint, touch2: TouchPoint): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  private calculateAngle(touch1: TouchPoint, touch2: TouchPoint): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.atan2(dy, dx);
  }
  
  private calculateDelta(oldTouches: TouchPoint[], newTouches: TouchPoint[]): { x: number; y: number } {
    if (oldTouches.length === 0 || newTouches.length === 0) {
      return { x: 0, y: 0 };
    }
    
    const oldTouch = oldTouches[0];
    const newTouch = newTouches[0];
    
    return {
      x: newTouch.clientX - oldTouch.clientX,
      y: newTouch.clientY - oldTouch.clientY
    };
  }
}
