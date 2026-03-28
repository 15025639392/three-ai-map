import { describe, it, expect, vi } from 'vitest';
import { GestureController } from '../../src/core/GestureController';

describe('GestureController', () => {
  it('creates a gesture controller', () => {
    const controller = new GestureController();
    expect(controller).toBeDefined();
  });

  it('handles single touch', () => {
    const controller = new GestureController();
    const onTouchStart = vi.fn();
    const onTouchMove = vi.fn();
    const onTouchEnd = vi.fn();
    
    controller.on('touchStart', onTouchStart);
    controller.on('touchMove', onTouchMove);
    controller.on('touchEnd', onTouchEnd);
    
    controller.handleTouchStart({ 
      touches: [{ clientX: 100, clientY: 200 }],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [{ clientX: 110, clientY: 210 }],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchEnd({ 
      touches: [],
      timeStamp: Date.now()
    } as any);
    
    expect(onTouchStart).toHaveBeenCalled();
    expect(onTouchMove).toHaveBeenCalled();
    expect(onTouchEnd).toHaveBeenCalled();
  });

  it('detects pinch gesture', () => {
    const controller = new GestureController();
    const onPinch = vi.fn();
    
    controller.on('pinch', onPinch);
    
    controller.handleTouchStart({ 
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 400 }
      ],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [
        { clientX: 80, clientY: 180 },
        { clientX: 320, clientY: 420 }
      ],
      timeStamp: Date.now()
    } as any);
    
    expect(onPinch).toHaveBeenCalled();
  });

  it('detects rotate gesture', () => {
    const controller = new GestureController();
    const onRotate = vi.fn();
    
    controller.on('rotate', onRotate);
    
    controller.handleTouchStart({ 
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 400 }
      ],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [
        { clientX: 120, clientY: 180 },
        { clientX: 280, clientY: 420 }
      ],
      timeStamp: Date.now()
    } as any);
    
    expect(onRotate).toHaveBeenCalled();
  });

  it('detects pan gesture', () => {
    const controller = new GestureController();
    const onPan = vi.fn();
    
    controller.on('pan', onPan);
    
    controller.handleTouchStart({ 
      touches: [{ clientX: 100, clientY: 200 }],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [{ clientX: 110, clientY: 210 }],
      timeStamp: Date.now()
    } as any);
    
    expect(onPan).toHaveBeenCalled();
  });

  it('calculates pinch scale', () => {
    const controller = new GestureController();
    
    controller.handleTouchStart({ 
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 400 }
      ],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [
        { clientX: 80, clientY: 180 },
        { clientX: 320, clientY: 420 }
      ],
      timeStamp: Date.now()
    } as any);
    
    const scale = controller.getPinchScale();
    expect(scale).toBeGreaterThan(1);
  });

  it('calculates rotation angle', () => {
    const controller = new GestureController();
    
    controller.handleTouchStart({ 
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 400 }
      ],
      timeStamp: Date.now()
    } as any);
    
    controller.handleTouchMove({ 
      touches: [
        { clientX: 120, clientY: 180 },
        { clientX: 280, clientY: 420 }
      ],
      timeStamp: Date.now()
    } as any);
    
    const angle = controller.getRotationAngle();
    expect(angle).not.toBe(0);
  });
});
