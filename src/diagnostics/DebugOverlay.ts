import type { DebugState } from "./DebugState";

type DebugMetricKey = keyof Pick<
  DebugState,
  | "fps"
  | "frameTimeMs"
  | "visibleTiles"
  | "activeTerrainTiles"
  | "activeImageryTiles"
  | "terrainRequestCount"
  | "imageryRequestCount"
  | "terrainDecodeFallbackCount"
  | "errorCount"
  | "recoveryPolicyQueryCount"
>;

const METRICS: Array<{ key: DebugMetricKey; label: string; digits?: number }> = [
  { key: "fps", label: "FPS", digits: 2 },
  { key: "frameTimeMs", label: "Frame", digits: 2 },
  { key: "visibleTiles", label: "Visible" },
  { key: "activeTerrainTiles", label: "Terrain" },
  { key: "activeImageryTiles", label: "Imagery" },
  { key: "terrainRequestCount", label: "Terrain Req" },
  { key: "imageryRequestCount", label: "Imagery Req" },
  { key: "terrainDecodeFallbackCount", label: "Decode Fallback" },
  { key: "errorCount", label: "Errors" },
  { key: "recoveryPolicyQueryCount", label: "Recovery Query" }
];

export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private readonly valueElements = new Map<DebugMetricKey, HTMLSpanElement>();

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.dataset.role = "debug-overlay";
    this.element.dataset.visible = "true";
    this.element.className = "debug-overlay";

    for (const metric of METRICS) {
      const row = document.createElement("div");
      row.className = "debug-overlay__row";

      const label = document.createElement("span");
      label.className = "debug-overlay__label";
      label.textContent = metric.label;

      const value = document.createElement("span");
      value.className = "debug-overlay__value";
      value.dataset.metric = metric.key;
      value.textContent = "0";

      row.append(label, value);
      this.element.append(row);
      this.valueElements.set(metric.key, value);
    }

    container.append(this.element);
  }

  update(state: DebugState): void {
    for (const metric of METRICS) {
      const element = this.valueElements.get(metric.key);

      if (!element) {
        continue;
      }

      const value = state[metric.key];
      element.textContent = metric.digits !== undefined ? value.toFixed(metric.digits) : `${value}`;
    }
  }

  destroy(): void {
    this.element.remove();
    this.valueElements.clear();
  }
}
