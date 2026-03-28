import { describe, it, expect } from 'vitest';
import { CustomLayer } from '../../src/layers/CustomLayer';
import { Coordinate } from '../../src/spatial/SpatialMath';

describe('CustomLayer', () => {
  it('creates a custom layer', () => {
    const layer = new CustomLayer({
      id: 'test-layer'
    });
    expect(layer).toBeDefined();
    expect(layer.id).toBe('test-layer');
  });

  it('renders custom content', () => {
    const layer = new CustomLayer({
      id: 'test-layer',
      render: (context) => {
        return true;
      }
    });
    
    const result = layer.render({});
    expect(result).toBe(true);
  });

  it('updates custom content', () => {
    const layer = new CustomLayer({
      id: 'test-layer',
      update: (context) => {
        return true;
      }
    });
    
    const result = layer.update({});
    expect(result).toBe(true);
  });

  it('handles custom events', () => {
    let eventCalled = false;
    
    const layer = new CustomLayer({
      id: 'test-layer',
      onEvent: (event) => {
        eventCalled = true;
        return true;
      }
    });
    
    layer.handleEvent({ type: 'click' });
    expect(eventCalled).toBe(true);
  });

  it('disposes custom resources', () => {
    let disposed = false;
    
    const layer = new CustomLayer({
      id: 'test-layer',
      dispose: () => {
        disposed = true;
      }
    });
    
    layer.dispose();
    expect(disposed).toBe(true);
  });

  it('supports custom data management', () => {
    const layer = new CustomLayer({
      id: 'test-layer'
    });
    
    layer.setData({ test: 'data' });
    const data = layer.getData();
    expect(data).toEqual({ test: 'data' });
  });

  it('supports custom visibility control', () => {
    const layer = new CustomLayer({
      id: 'test-layer',
      visible: false
    });
    
    expect(layer.isVisible()).toBe(false);
    
    layer.setVisible(true);
    expect(layer.isVisible()).toBe(true);
  });
});
