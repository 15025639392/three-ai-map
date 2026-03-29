import "../src/styles.css";
import { GlobeEngine, Layer, VectorTileLayer } from "../src";
import type { LayerContext } from "../src/layers/Layer";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

class RecoveryStageProbeLayer extends Layer {
  private readonly tileLoadProbeCount: number;

  constructor(id: string, tileLoadProbeCount = 4) {
    super(id);
    this.tileLoadProbeCount = tileLoadProbeCount;
  }

  onAdd(context: LayerContext): void {
    for (let index = 0; index < this.tileLoadProbeCount; index += 1) {
      context.resolveRecovery?.({
        layerId: this.id,
        stage: "tile-load",
        category: "network",
        severity: "warn"
      });
    }
    context.requestRender?.();
  }

  onRemove(_context: LayerContext): void {}
}

export function runSurfaceTileRecoveryStagesRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 720, 420);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#05101a",
    recoveryPolicy: {
      rules: [
        {
          stage: "tile-load",
          category: "network",
          severity: "warn",
          overrides: {
            elevationRetryAttempts: 1,
            elevationRetryDelayMs: 0
          }
        },
        {
          stage: "tile-parse",
          category: "data",
          severity: "warn",
          overrides: {
            vectorParseRetryAttempts: 1,
            vectorParseRetryDelayMs: 0,
            vectorParseFallbackToEmpty: true
          }
        }
      ]
    }
  });
  const probeLayer = new RecoveryStageProbeLayer("surface-recovery-stage-probe");
  const vectorLayer = new VectorTileLayer({
    url: "memory://{z}/{x}/{y}.pbf"
  });

  const finalize = (): void => {
    const report = engine.getPerformanceReport();
    const tileLoadQueryCount = report.metrics.get("recoveryPolicyQueryCount:tile-load")?.value ?? 0;
    const tileLoadHitCount = report.metrics.get("recoveryPolicyHitCount:tile-load")?.value ?? 0;
    const tileLoadRuleHitCount = report.metrics.get("recoveryPolicyRuleHitCount:tile-load")?.value ?? 0;
    const tileParseQueryCount = report.metrics.get("recoveryPolicyQueryCount:tile-parse")?.value ?? 0;
    const tileParseHitCount = report.metrics.get("recoveryPolicyHitCount:tile-parse")?.value ?? 0;
    const tileParseRuleHitCount = report.metrics.get("recoveryPolicyRuleHitCount:tile-parse")?.value ?? 0;

    container.dataset.phase = "after-stage-recovery";
    container.dataset.recoveryPolicyTileLoadQueryCount = `${tileLoadQueryCount}`;
    container.dataset.recoveryPolicyTileLoadHitCount = `${tileLoadHitCount}`;
    container.dataset.recoveryPolicyTileLoadRuleHitCount = `${tileLoadRuleHitCount}`;
    container.dataset.recoveryPolicyTileParseQueryCount = `${tileParseQueryCount}`;
    container.dataset.recoveryPolicyTileParseHitCount = `${tileParseHitCount}`;
    container.dataset.recoveryPolicyTileParseRuleHitCount = `${tileParseRuleHitCount}`;
    output.textContent = `after-stage-recovery:tile-load=${tileLoadQueryCount}/${tileLoadHitCount}:tile-parse=${tileParseQueryCount}/${tileParseHitCount}`;
  };

  const handleError = (error: unknown): void => {
    container.dataset.phase = "error";
    output.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
  };

  container.dataset.phase = "booting";
  container.dataset.recoveryPolicyTileLoadQueryCount = "";
  container.dataset.recoveryPolicyTileLoadHitCount = "";
  container.dataset.recoveryPolicyTileLoadRuleHitCount = "";
  container.dataset.recoveryPolicyTileParseQueryCount = "";
  container.dataset.recoveryPolicyTileParseHitCount = "";
  container.dataset.recoveryPolicyTileParseRuleHitCount = "";
  output.textContent = "booting:surface-tile-recovery-stages-regression";

  engine.addLayer(probeLayer);
  engine.addLayer(vectorLayer);

  window.setTimeout(() => {
    void vectorLayer
      .setTileData(new Uint8Array([0x1a]), 0, 0, 0)
      .then(finalize)
      .catch(handleError);
  }, 0);

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __surfaceTileRecoveryStagesRegression?: {
          engine: GlobeEngine;
          probeLayer: RecoveryStageProbeLayer;
          vectorLayer: VectorTileLayer;
        };
      }
    ).__surfaceTileRecoveryStagesRegression = {
      engine,
      probeLayer,
      vectorLayer
    };
  }

  return engine;
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container");
  }

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">Back to Demos</a>
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">booting:surface-tile-recovery-stages-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runSurfaceTileRecoveryStagesRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
