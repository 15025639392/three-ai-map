export interface AnimationOptions {
  duration: number;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
  easing?: (t: number) => number;
}

export interface Animation {
  id: string;
  duration: number;
  elapsed: number;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
  easing: (t: number) => number;
  completed: boolean;
}

export class AnimationManager {
  private animations: Map<string, Animation> = new Map();
  private nextId = 0;
  private lastTimestamp: number = 0;
  
  startAnimation(options: AnimationOptions): string {
    const id = `animation-${this.nextId++}`;
    const animation: Animation = {
      id,
      duration: options.duration,
      elapsed: 0,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
      easing: options.easing || AnimationManager.easeInOutQuad,
      completed: false
    };
    
    this.animations.set(id, animation);
    return id;
  }
  
  update(deltaTime: number): void {
    const toRemove: string[] = [];
    
    for (const [id, animation] of this.animations) {
      if (animation.completed) {
        toRemove.push(id);
        continue;
      }
      
      animation.elapsed += deltaTime;
      
      if (animation.elapsed >= animation.duration) {
        animation.onUpdate(1);
        animation.completed = true;
        
        if (animation.onComplete) {
          animation.onComplete();
        }
        
        toRemove.push(id);
      } else {
        const progress = animation.elapsed / animation.duration;
        const easedProgress = animation.easing(progress);
        animation.onUpdate(easedProgress);
      }
    }
    
    for (const id of toRemove) {
      this.animations.delete(id);
    }
  }
  
  cancelAnimation(id: string): void {
    this.animations.delete(id);
  }
  
  cancelAllAnimations(): void {
    this.animations.clear();
  }
  
  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  static easeInQuad(t: number): number {
    return t * t;
  }
  
  static easeOutQuad(t: number): number {
    return t * (2 - t);
  }
  
  static easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  
  static easeInCubic(t: number): number {
    return t * t * t;
  }
  
  static easeOutCubic(t: number): number {
    return --t * t * t + 1;
  }
  
  static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }
}
