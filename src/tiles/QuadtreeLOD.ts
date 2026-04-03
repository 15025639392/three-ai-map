export interface QuadtreeLODOptions {
  maximumScreenSpaceError: number;
}

export interface ScreenSpaceErrorInput {
  geometricError: number;
  distance: number;
  screenHeight: number;
}

export class QuadtreeLOD {
  constructor(private readonly options: QuadtreeLODOptions) {}

  calculateSSE(input: ScreenSpaceErrorInput): number {
    return (input.geometricError * input.screenHeight) / Math.max(input.distance, 1);
  }

  shouldRefine(sse: number): boolean {
    return sse > this.options.maximumScreenSpaceError;
  }
}
