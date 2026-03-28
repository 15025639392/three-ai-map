import { describe, it, expect, vi } from 'vitest';
import { AnimationManager } from '../../src/core/Animation';

describe('AnimationManager', () => {
  it('creates an animation manager', () => {
    const manager = new AnimationManager();
    expect(manager).toBeDefined();
  });

  it('starts an animation', () => {
    const manager = new AnimationManager();
    const animationId = manager.startAnimation({
      duration: 1000,
      onUpdate: vi.fn(),
      onComplete: vi.fn()
    });
    
    expect(animationId).toBeDefined();
  });

  it('updates animation on each frame', () => {
    const manager = new AnimationManager();
    const onUpdate = vi.fn();
    
    manager.startAnimation({
      duration: 1000,
      onUpdate,
      onComplete: vi.fn()
    });
    
    manager.update(100);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onComplete when animation finishes', () => {
    const manager = new AnimationManager();
    const onComplete = vi.fn();
    
    manager.startAnimation({
      duration: 100,
      onUpdate: vi.fn(),
      onComplete
    });
    
    manager.update(100);
    expect(onComplete).toHaveBeenCalled();
  });

  it('cancels an animation', () => {
    const manager = new AnimationManager();
    const onUpdate = vi.fn();
    
    const animationId = manager.startAnimation({
      duration: 1000,
      onUpdate,
      onComplete: vi.fn()
    });
    
    manager.cancelAnimation(animationId);
    manager.update(100);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('linearly interpolates values', () => {
    const value = AnimationManager.lerp(0, 100, 0.5);
    expect(value).toBe(50);
  });

  it('ease in quadratic easing', () => {
    const value = AnimationManager.easeInQuad(0.5);
    expect(value).toBe(0.25);
  });

  it('ease out quadratic easing', () => {
    const value = AnimationManager.easeOutQuad(0.5);
    expect(value).toBe(0.75);
  });

  it('ease in-out quadratic easing', () => {
    const value = AnimationManager.easeInOutQuad(0.5);
    expect(value).toBe(0.5);
  });
});
