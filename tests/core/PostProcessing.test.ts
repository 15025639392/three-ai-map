import { describe, it, expect } from 'vitest';
import { PostProcessing } from '../../src/core/PostProcessing';

describe('PostProcessing', () => {
  it('creates a post-processing system', () => {
    const pp = new PostProcessing();
    expect(pp).toBeDefined();
  });

  it('adds a bloom pass', () => {
    const pp = new PostProcessing();
    pp.addBloom({
      threshold: 0.5,
      strength: 1.5,
      radius: 0.5
    });
    
    expect(pp.hasBloom()).toBe(true);
  });

  it('adds a color correction pass', () => {
    const pp = new PostProcessing();
    pp.addColorCorrection({
      exposure: 1,
      contrast: 1,
      saturation: 1
    });
    
    expect(pp.hasColorCorrection()).toBe(true);
  });

  it('removes a pass', () => {
    const pp = new PostProcessing();
    pp.addBloom();
    pp.removeBloom();
    
    expect(pp.hasBloom()).toBe(false);
  });

  it('enables/disables post-processing', () => {
    const pp = new PostProcessing();
    pp.addBloom();
    
    expect(pp.isEnabled()).toBe(true);
    
    pp.setEnabled(false);
    expect(pp.isEnabled()).toBe(false);
  });

  it('updates pass parameters', () => {
    const pp = new PostProcessing();
    pp.addBloom({ threshold: 0.5 });
    
    pp.updateBloom({ threshold: 0.8 });
    expect(pp.hasBloom()).toBe(true);
  });

  it('clears all passes', () => {
    const pp = new PostProcessing();
    pp.addBloom();
    pp.addColorCorrection();
    
    pp.clear();
    expect(pp.hasBloom()).toBe(false);
    expect(pp.hasColorCorrection()).toBe(false);
  });
});
