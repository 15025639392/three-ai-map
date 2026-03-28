export interface BloomOptions {
  threshold?: number;
  strength?: number;
  radius?: number;
}

export interface ColorCorrectionOptions {
  exposure?: number;
  contrast?: number;
  saturation?: number;
}

export class PostProcessing {
  private bloomEnabled: boolean = false;
  private bloomOptions: BloomOptions = {};
  private colorCorrectionEnabled: boolean = false;
  private colorCorrectionOptions: ColorCorrectionOptions = {};
  private enabled: boolean = true;
  
  constructor() {
    // Initialize default values
    this.bloomOptions = {
      threshold: 0.5,
      strength: 1.5,
      radius: 0.5
    };
    
    this.colorCorrectionOptions = {
      exposure: 1,
      contrast: 1,
      saturation: 1
    };
  }
  
  addBloom(options?: BloomOptions): void {
    this.bloomEnabled = true;
    if (options) {
      this.bloomOptions = { ...this.bloomOptions, ...options };
    }
  }
  
  removeBloom(): void {
    this.bloomEnabled = false;
  }
  
  hasBloom(): boolean {
    return this.bloomEnabled;
  }
  
  updateBloom(options: Partial<BloomOptions>): void {
    this.bloomOptions = { ...this.bloomOptions, ...options };
  }
  
  getBloomOptions(): BloomOptions {
    return { ...this.bloomOptions };
  }
  
  addColorCorrection(options?: ColorCorrectionOptions): void {
    this.colorCorrectionEnabled = true;
    if (options) {
      this.colorCorrectionOptions = { ...this.colorCorrectionOptions, ...options };
    }
  }
  
  removeColorCorrection(): void {
    this.colorCorrectionEnabled = false;
  }
  
  hasColorCorrection(): boolean {
    return this.colorCorrectionEnabled;
  }
  
  updateColorCorrection(options: Partial<ColorCorrectionOptions>): void {
    this.colorCorrectionOptions = { ...this.colorCorrectionOptions, ...options };
  }
  
  getColorCorrectionOptions(): ColorCorrectionOptions {
    return { ...this.colorCorrectionOptions };
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  clear(): void {
    this.bloomEnabled = false;
    this.colorCorrectionEnabled = false;
    this.bloomOptions = {
      threshold: 0.5,
      strength: 1.5,
      radius: 0.5
    };
    this.colorCorrectionOptions = {
      exposure: 1,
      contrast: 1,
      saturation: 1
    };
  }
  
  hasPasses(): boolean {
    return this.bloomEnabled || this.colorCorrectionEnabled;
  }
}
