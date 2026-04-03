export interface DebugState {
  fps: number;
  frameTimeMs: number;
  activeImageryTiles: number;
  activeTerrainTiles: number;
  visibleTiles: number;
  imageryRequestCount: number;
  terrainRequestCount: number;
  terrainDecodeFallbackCount: number;
  errorCount: number;
  recoveryPolicyQueryCount: number;
  recoveryPolicyHitCount: number;
  recoveryPolicyRuleHitCount: number;
}
