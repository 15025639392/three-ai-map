import "../src/styles.css";
import {
  GlobeEngine,
  ObliquePhotogrammetryLayer,
  ThreeDTilesTileset
} from "../src";

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function createOblique3DTilesFixture(): ThreeDTilesTileset {
  const altitudeScale = 6378137;

  return {
    asset: {
      version: "1.1"
    },
    geometricError: 4.8,
    root: {
      id: "root",
      boundingVolume: {
        region: [
          -0.09,
          -0.09,
          0.09,
          0.09,
          0.02 * altitudeScale,
          0.02 * altitudeScale
        ]
      },
      geometricError: 4.8,
      children: [
        {
          id: "child-center",
          boundingVolume: {
            region: [
              -0.055,
              -0.055,
              0.055,
              0.055,
              0.03 * altitudeScale,
              0.03 * altitudeScale
            ]
          },
          geometricError: 1.6
        },
        {
          id: "child-east",
          boundingVolume: {
            region: [
              0.11,
              -0.05,
              0.21,
              0.05,
              0.03 * altitudeScale,
              0.03 * altitudeScale
            ]
          },
          geometricError: 1.6
        },
        {
          id: "child-west",
          boundingVolume: {
            region: [
              -0.21,
              -0.05,
              -0.11,
              0.05,
              0.03 * altitudeScale,
              0.03 * altitudeScale
            ]
          },
          geometricError: 1.6
        }
      ]
    }
  };
}

function setDataAttribute(container: HTMLElement, key: string, value: string | number): void {
  container.dataset[key] = `${value}`;
}

export function runObliquePhotogrammetryRegression(
  container: HTMLElement,
  output: HTMLElement
): GlobeEngine {
  setStageSize(container, 960, 540);
  const engine = new GlobeEngine({
    container,
    radius: 1,
    background: "#020611"
  });
  const layer = new ObliquePhotogrammetryLayer("oblique-photogrammetry-regression", {
    tileset3DTiles: createOblique3DTilesFixture(),
    threeDTilesMetersToAltitudeScale: 1 / 6378137,
    maxScreenSpaceError: 1.8
  });

  container.dataset.phase = "booting";
  container.dataset.tilesetNodeCount = "";
  container.dataset.sequenceStepCount = "";
  container.dataset.baselineVisibleNodeCount = "";
  container.dataset.nearVisibleNodeCount = "";
  container.dataset.recoveryVisibleNodeCount = "";
  container.dataset.visibleNodeCountMin = "";
  container.dataset.visibleNodeCountMax = "";
  container.dataset.maxVisibleDepth = "";
  container.dataset.pickHitType = "";
  container.dataset.pickHitNodeId = "";
  container.dataset.driftCycleCount = "";
  container.dataset.recoveryStableCount = "";
  container.dataset.nearPickHitCount = "";
  container.dataset.visibilityDriftMax = "";
  container.dataset.averageFps = "";
  container.dataset.frameDrops = "";
  container.dataset.allExpected = "";
  output.textContent = "启动中:oblique-photogrammetry-regression";

  engine.addLayer(layer);
  engine.setView({ lng: 0, lat: 0, altitude: 2.8 });

  void (async () => {
    try {
      await layer.ready();
      const sequence = [
        { name: "baseline", lng: 0, lat: 0, altitude: 2.8 },
        { name: "near", lng: 0, lat: 0, altitude: 1.6 },
        { name: "recovery", lng: 0, lat: 0, altitude: 2.8 }
      ] as const;
      const driftCycleCount = 3;
      const visibleByStep: Record<(typeof sequence)[number]["name"], number> = {
        baseline: 0,
        near: 0,
        recovery: 0
      };
      const depthByStep: Record<(typeof sequence)[number]["name"], number> = {
        baseline: 0,
        near: 0,
        recovery: 0
      };
      const baselineVisibleByCycle: number[] = [];
      const nearVisibleByCycle: number[] = [];
      const recoveryVisibleByCycle: number[] = [];
      const nearPickNodeIdsByCycle: string[] = [];
      let pickResult: ReturnType<GlobeEngine["pick"]> = null;
      let sequenceStepCount = 0;

      if (typeof engine.resetPerformanceReport === "function") {
        engine.resetPerformanceReport();
      }

      for (let cycleIndex = 0; cycleIndex < driftCycleCount; cycleIndex += 1) {
        const nearAltitude = Number((1.56 + cycleIndex * 0.04).toFixed(2));
        const cycleSequence = [
          { name: "baseline", lng: 0, lat: 0, altitude: 2.8 },
          { name: "near", lng: 0, lat: 0, altitude: nearAltitude },
          { name: "recovery", lng: 0, lat: 0, altitude: 2.8 }
        ] as const;

        for (const step of cycleSequence) {
          sequenceStepCount += 1;
          engine.setView({
            lng: step.lng,
            lat: step.lat,
            altitude: step.altitude
          });
          await sleep(120);
          engine.render();
          const stats = layer.getDebugStats();
          visibleByStep[step.name] = stats.visibleNodeCount;
          depthByStep[step.name] = stats.maxVisibleDepth;
          container.dataset.phase = `${step.name}-oblique-cycle-${cycleIndex + 1}`;
          output.textContent = `${step.name}-oblique-cycle-${cycleIndex + 1}:${stats.visibleNodeCount}`;

          if (step.name === "near") {
            const stageRect = container.getBoundingClientRect();
            pickResult = engine.pick(
              stageRect.left + stageRect.width / 2,
              stageRect.top + stageRect.height / 2
            );
          }
        }

        baselineVisibleByCycle.push(visibleByStep.baseline);
        nearVisibleByCycle.push(visibleByStep.near);
        recoveryVisibleByCycle.push(visibleByStep.recovery);
        nearPickNodeIdsByCycle.push(
          pickResult?.type === "oblique-photogrammetry-node" ? pickResult.node.id : "none"
        );
      }

      if (!pickResult) {
        const stageRect = container.getBoundingClientRect();
        pickResult = engine.pick(
          stageRect.left + stageRect.width / 2,
          stageRect.top + stageRect.height / 2
        );
      }
      const report = engine.getPerformanceReport();
      const averageFPS = Number(Math.min(Math.max(report.averageFPS, 0), 1200).toFixed(2));
      const frameDrops = report.frameDrops;
      const tilesetNodeCount = layer.getDebugStats().nodeTotalCount;
      const baselineVisibleNodeCount = baselineVisibleByCycle[baselineVisibleByCycle.length - 1] ?? 0;
      const nearVisibleNodeCount = nearVisibleByCycle[nearVisibleByCycle.length - 1] ?? 0;
      const recoveryVisibleNodeCount = recoveryVisibleByCycle[recoveryVisibleByCycle.length - 1] ?? 0;
      const visibleNodeCountMin = Math.min(
        ...baselineVisibleByCycle,
        ...nearVisibleByCycle,
        ...recoveryVisibleByCycle
      );
      const visibleNodeCountMax = Math.max(
        ...baselineVisibleByCycle,
        ...nearVisibleByCycle,
        ...recoveryVisibleByCycle
      );
      const maxVisibleDepth = Math.max(
        depthByStep.baseline,
        depthByStep.near,
        depthByStep.recovery
      );
      const recoveryStableCount = recoveryVisibleByCycle.reduce((count, value, index) => {
        if (value === baselineVisibleByCycle[index]) {
          return count + 1;
        }
        return count;
      }, 0);
      const nearPickHitCount = nearPickNodeIdsByCycle.reduce((count, value) => {
        if (value === "child-center") {
          return count + 1;
        }
        return count;
      }, 0);
      const baselineReference = baselineVisibleByCycle[0] ?? 0;
      const recoveryReference = recoveryVisibleByCycle[0] ?? 0;
      const visibilityDriftMax = Math.max(
        ...baselineVisibleByCycle.map((value) => Math.abs(value - baselineReference)),
        ...recoveryVisibleByCycle.map((value) => Math.abs(value - recoveryReference))
      );
      const pickHitType = pickResult?.type ?? "none";
      const pickHitNodeId = pickResult?.type === "oblique-photogrammetry-node"
        ? pickResult.node.id
        : "none";
      const allExpected = Number(
        tilesetNodeCount === 4 &&
          sequenceStepCount === driftCycleCount * sequence.length &&
          baselineVisibleNodeCount === 1 &&
          nearVisibleNodeCount >= 2 &&
          recoveryVisibleNodeCount === 1 &&
          recoveryStableCount === driftCycleCount &&
          nearPickHitCount === driftCycleCount &&
          visibilityDriftMax === 0 &&
          visibleNodeCountMin === 1 &&
          visibleNodeCountMax >= 2 &&
          maxVisibleDepth >= 1 &&
          pickHitType === "oblique-photogrammetry-node" &&
          pickHitNodeId === "child-center"
      );

      container.dataset.phase = "after-oblique-photogrammetry";
      setDataAttribute(container, "tilesetNodeCount", tilesetNodeCount);
      setDataAttribute(container, "sequenceStepCount", sequenceStepCount);
      setDataAttribute(container, "baselineVisibleNodeCount", baselineVisibleNodeCount);
      setDataAttribute(container, "nearVisibleNodeCount", nearVisibleNodeCount);
      setDataAttribute(container, "recoveryVisibleNodeCount", recoveryVisibleNodeCount);
      setDataAttribute(container, "visibleNodeCountMin", visibleNodeCountMin);
      setDataAttribute(container, "visibleNodeCountMax", visibleNodeCountMax);
      setDataAttribute(container, "maxVisibleDepth", maxVisibleDepth);
      setDataAttribute(container, "pickHitType", pickHitType);
      setDataAttribute(container, "pickHitNodeId", pickHitNodeId);
      setDataAttribute(container, "driftCycleCount", driftCycleCount);
      setDataAttribute(container, "recoveryStableCount", recoveryStableCount);
      setDataAttribute(container, "nearPickHitCount", nearPickHitCount);
      setDataAttribute(container, "visibilityDriftMax", visibilityDriftMax);
      setDataAttribute(container, "averageFps", averageFPS);
      setDataAttribute(container, "frameDrops", frameDrops);
      setDataAttribute(container, "allExpected", allExpected);
      output.textContent = `after-oblique-photogrammetry:nodes=${baselineVisibleNodeCount}/${nearVisibleNodeCount}/${recoveryVisibleNodeCount}:pick=${pickHitType}:${pickHitNodeId}:drift=${visibilityDriftMax}`;
    } catch (error) {
      container.dataset.phase = "error";
      output.textContent = error instanceof Error ? `错误:${error.message}` : "错误:未知";
    }
  })();

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __obliquePhotogrammetryRegression?: {
          engine: GlobeEngine;
          layer: ObliquePhotogrammetryLayer;
        };
      }
    ).__obliquePhotogrammetryRegression = {
      engine,
      layer
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
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">启动中:oblique-photogrammetry-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runObliquePhotogrammetryRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
