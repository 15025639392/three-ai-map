import "../src/styles.css";
import { GlobeEngine, RasterLayer, TerrainTileLayer } from "../src";
import { runGaodeSatellite } from "./tile-sources-gaode-baidu";

interface SurfaceTilePlanSnapshot {
  targetZoom: number;
  interactionPhase: "idle" | "interacting";
  nodes: Array<{
    coordinate: {
      z: number;
      x: number;
      y: number;
    };
  }>;
}

interface TerrainTileDebugEntry {
  mesh: unknown;
  displayState: "parentFallback" | "readyLeaf";
}

interface RasterTileDebugEntry {
  mesh: unknown;
  requestedImageryTileKeys: string[];
}

interface SmokeSnapshot {
  interactionPhase: "idle" | "interacting";
  sharedTargetZoom: number;
  sharedLeafZooms: number[];
  terrainDisplayZooms: number[];
  terrainParentFallbackCount: number;
  terrainReadyLeafCount: number;
  rasterHostZooms: number[];
  rasterRequestedZooms: number[];
}

interface SmokeOptions {
  enabled: boolean;
  targetZoom: number;
}

const DEFAULT_TARGET_ZOOM = 18;
const BASELINE_SMOKE_ZOOM = 8;
const INTERACTION_IDLE_WAIT_MS = 320;
const MAX_SMOKE_WAIT_MS = 20_000;
const SMOKE_POLL_INTERVAL_MS = 50;

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.flex = "none";
}

function waitForVirtualTime(delayMs = 0): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function tileKeysToZooms(tileKeys: string[]): number[] {
  return uniqueSortedNumbers(tileKeys
    .map((tileKey) => Number.parseInt(tileKey.split("/")[0] ?? "", 10))
    .filter((zoom) => Number.isFinite(zoom)));
}

function sameZooms(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatZooms(zooms: number[]): string {
  return zooms.join(",");
}

function resolveSmokeOptions(): SmokeOptions {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      targetZoom: DEFAULT_TARGET_ZOOM
    };
  }

  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("smoke") === "pan";
  const requestedZoom = Number.parseInt(params.get("targetZoom") ?? "", 10);

  return {
    enabled,
    targetZoom: Number.isFinite(requestedZoom) ? requestedZoom : DEFAULT_TARGET_ZOOM
  };
}

function altitudeForTargetZoom(radius: number, targetZoom: number): number {
  const computedAltitude = (radius * 4) / (2 ** targetZoom);
  const minAltitude = radius * 0.000001;

  return Math.max(minAltitude, computedAltitude);
}

function getLayerManager(engine: GlobeEngine): {
  get(layerId: string): unknown;
} {
  const layerManager = Reflect.get(engine as object, "layerManager");

  if (!layerManager || typeof layerManager !== "object") {
    throw new Error("Missing GlobeEngine layer manager");
  }

  return layerManager as {
    get(layerId: string): unknown;
  };
}

function getSourceManager(engine: GlobeEngine): {
  get(sourceId: string): unknown;
} {
  const sourceManager = Reflect.get(engine as object, "sourceManager");

  if (!sourceManager || typeof sourceManager !== "object") {
    throw new Error("Missing GlobeEngine source manager");
  }

  return sourceManager as {
    get(sourceId: string): unknown;
  };
}

function getSurfaceTilePlan(engine: GlobeEngine): SurfaceTilePlanSnapshot {
  const getter = Reflect.get(engine as object, "getSurfaceTilePlan");

  if (typeof getter !== "function") {
    throw new Error("Missing GlobeEngine surface tile plan getter");
  }

  return (getter as () => SurfaceTilePlanSnapshot).call(engine);
}

function forceInteractingPhase(engine: GlobeEngine): void {
  Reflect.set(engine as object, "surfaceTileInteractionPhase", "interacting");
  const scheduleIdleReset = Reflect.get(engine as object, "scheduleInteractionIdleReset");

  if (typeof scheduleIdleReset === "function") {
    (scheduleIdleReset as () => void).call(engine);
  }
}

function applySmokeLoadDelay(engine: GlobeEngine, detailZoom: number, delayMs = 220): void {
  const terrainScheduler = Reflect.get(getTerrainLayer(engine) as object, "elevationScheduler");

  if (terrainScheduler && typeof terrainScheduler === "object") {
    const originalTerrainLoad = Reflect.get(terrainScheduler, "loadTile");

    if (typeof originalTerrainLoad === "function") {
      Reflect.set(
        terrainScheduler,
        "loadTile",
        async (coordinate: { z: number }, signal?: AbortSignal) => {
          if (coordinate.z >= detailZoom) {
            await waitForVirtualTime(delayMs);
          }

          return (originalTerrainLoad as (
            coordinate: { z: number },
            signal?: AbortSignal
          ) => Promise<unknown>).call(terrainScheduler, coordinate, signal);
        }
      );
    }
  }

  const rasterSource = getSourceManager(engine).get("gaode-satellite");

  if (!rasterSource || typeof rasterSource !== "object") {
    return;
  }

  const rasterScheduler = Reflect.get(rasterSource, "scheduler");

  if (!rasterScheduler || typeof rasterScheduler !== "object") {
    return;
  }

  const originalRasterLoad = Reflect.get(rasterScheduler, "loadTile");

  if (typeof originalRasterLoad !== "function") {
    return;
  }

  Reflect.set(
    rasterScheduler,
    "loadTile",
    async (coordinate: { z: number }, signal?: AbortSignal) => {
      if (coordinate.z >= detailZoom) {
        await waitForVirtualTime(delayMs);
      }

      return (originalRasterLoad as (
        coordinate: { z: number },
        signal?: AbortSignal
      ) => Promise<unknown>).call(rasterScheduler, coordinate, signal);
    }
  );
}

function getTerrainLayer(engine: GlobeEngine): TerrainTileLayer {
  const terrain = getLayerManager(engine).get("terrain");

  if (!(terrain instanceof TerrainTileLayer)) {
    throw new Error("Missing terrain layer for gaode smoke");
  }

  return terrain;
}

function getRasterLayer(engine: GlobeEngine): RasterLayer {
  const raster = getLayerManager(engine).get("gaode-satellite");

  if (!(raster instanceof RasterLayer)) {
    throw new Error("Missing raster layer for gaode smoke");
  }

  return raster;
}

function getTerrainEntries(terrain: TerrainTileLayer): Map<string, TerrainTileDebugEntry> {
  const entries = Reflect.get(terrain as object, "activeTiles");

  if (!(entries instanceof Map)) {
    throw new Error("Missing terrain active tile entries");
  }

  return entries as Map<string, TerrainTileDebugEntry>;
}

function getRasterEntries(raster: RasterLayer): Map<string, RasterTileDebugEntry> {
  const entries = Reflect.get(raster as object, "activeTiles");

  if (!(entries instanceof Map)) {
    throw new Error("Missing raster active tile entries");
  }

  return entries as Map<string, RasterTileDebugEntry>;
}

function readSmokeSnapshot(engine: GlobeEngine): SmokeSnapshot {
  const plan = getSurfaceTilePlan(engine);
  const terrain = getTerrainLayer(engine);
  const raster = getRasterLayer(engine);
  const terrainDisplayKeys = terrain.getActiveTileKeys();
  const terrainEntries = getTerrainEntries(terrain);
  const rasterEntries = getRasterEntries(raster);
  let terrainParentFallbackCount = 0;
  let terrainReadyLeafCount = 0;

  for (const key of terrainDisplayKeys) {
    const displayState = terrainEntries.get(key)?.displayState;

    if (displayState === "parentFallback") {
      terrainParentFallbackCount += 1;
      continue;
    }

    if (displayState === "readyLeaf") {
      terrainReadyLeafCount += 1;
    }
  }

  const rasterHostKeys = [...rasterEntries.keys()];
  const rasterRequestedKeys = [...rasterEntries.values()]
    .flatMap((entry) => entry.requestedImageryTileKeys);

  return {
    interactionPhase: plan.interactionPhase,
    sharedTargetZoom: plan.targetZoom,
    sharedLeafZooms: uniqueSortedNumbers(plan.nodes.map((node) => node.coordinate.z)),
    terrainDisplayZooms: tileKeysToZooms(terrainDisplayKeys),
    terrainParentFallbackCount,
    terrainReadyLeafCount,
    rasterHostZooms: tileKeysToZooms(rasterHostKeys),
    rasterRequestedZooms: tileKeysToZooms(rasterRequestedKeys)
  };
}

function writeSnapshot(stage: HTMLElement, prefix: string, snapshot: SmokeSnapshot): void {
  stage.dataset[`${prefix}SharedTargetZoom`] = `${snapshot.sharedTargetZoom}`;
  stage.dataset[`${prefix}InteractionPhase`] = snapshot.interactionPhase;
  stage.dataset[`${prefix}SharedLeafZooms`] = formatZooms(snapshot.sharedLeafZooms);
  stage.dataset[`${prefix}TerrainDisplayZooms`] = formatZooms(snapshot.terrainDisplayZooms);
  stage.dataset[`${prefix}TerrainParentFallbackCount`] = `${snapshot.terrainParentFallbackCount}`;
  stage.dataset[`${prefix}TerrainReadyLeafCount`] = `${snapshot.terrainReadyLeafCount}`;
  stage.dataset[`${prefix}RasterHostZooms`] = formatZooms(snapshot.rasterHostZooms);
  stage.dataset[`${prefix}RasterRequestedZooms`] = formatZooms(snapshot.rasterRequestedZooms);
}

async function waitForSnapshot(
  engine: GlobeEngine,
  predicate: (snapshot: SmokeSnapshot) => boolean,
  timeoutMs = MAX_SMOKE_WAIT_MS,
  onSample?: (snapshot: SmokeSnapshot) => void
): Promise<SmokeSnapshot> {
  const start = Date.now();

  while (true) {
    engine.render();
    const snapshot = readSmokeSnapshot(engine);
    onSample?.(snapshot);

    if (predicate(snapshot)) {
      return snapshot;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for gaode smoke snapshot");
    }

    await waitForVirtualTime(SMOKE_POLL_INTERVAL_MS);
  }
}

async function runDragPanSmoke(
  engine: GlobeEngine,
  stage: HTMLElement,
  status: HTMLElement,
  targetZoom: number
): Promise<void> {
  const terrain = getTerrainLayer(engine);
  const terrainPlannerMaxZoom = terrain.getSurfaceTilePlannerConfig().maxZoom;
  const expectedSharedTargetZoom = Math.min(targetZoom, terrainPlannerMaxZoom);

  stage.dataset.phase = "seeking-initial";
  stage.dataset.requestedTargetZoom = `${targetZoom}`;
  stage.dataset.terrainPlannerMaxZoom = `${terrainPlannerMaxZoom}`;
  status.textContent = `启动中:gaode-pan-smoke:initial:z${targetZoom}`;

  engine.setView({
    lng: 104.07,
    lat: 35.44,
    altitude: altitudeForTargetZoom(engine.radius, BASELINE_SMOKE_ZOOM)
  });

  await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.sharedTargetZoom < expectedSharedTargetZoom &&
      snapshot.terrainDisplayZooms.length > 0 &&
      snapshot.rasterHostZooms.length > 0 &&
      snapshot.terrainDisplayZooms.some((zoom) => zoom < expectedSharedTargetZoom),
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );

  applySmokeLoadDelay(engine, expectedSharedTargetZoom);

  engine.setView({
    lng: 104.07,
    lat: 35.44,
    altitude: altitudeForTargetZoom(engine.radius, targetZoom)
  });
  forceInteractingPhase(engine);
  engine.render();

  stage.dataset.phase = "seeking-interacting";
  status.textContent = `启动中:gaode-pan-smoke:interacting:z${targetZoom}`;

  const interactingSnapshot = await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.interactionPhase === "interacting" &&
      snapshot.sharedTargetZoom === expectedSharedTargetZoom &&
      snapshot.sharedLeafZooms.length === 1 &&
      snapshot.sharedLeafZooms[0] === expectedSharedTargetZoom &&
      snapshot.terrainParentFallbackCount > 0 &&
      snapshot.terrainDisplayZooms.some((zoom) => zoom < expectedSharedTargetZoom) &&
      sameZooms(snapshot.terrainDisplayZooms, snapshot.rasterHostZooms) &&
      snapshot.rasterRequestedZooms.includes(expectedSharedTargetZoom) &&
      snapshot.rasterRequestedZooms.some((zoom) => zoom < expectedSharedTargetZoom),
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );
  writeSnapshot(stage, "interacting", interactingSnapshot);

  stage.dataset.phase = "seeking-idle";
  status.textContent = `启动中:gaode-pan-smoke:idle:z${targetZoom}`;

  await waitForVirtualTime(INTERACTION_IDLE_WAIT_MS);

  const idleSnapshot = await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.interactionPhase === "idle" &&
      snapshot.sharedTargetZoom === expectedSharedTargetZoom &&
      snapshot.sharedLeafZooms.length === 1 &&
      snapshot.sharedLeafZooms[0] === expectedSharedTargetZoom &&
      snapshot.terrainParentFallbackCount === 0 &&
      snapshot.terrainDisplayZooms.length === 1 &&
      snapshot.terrainDisplayZooms[0] === expectedSharedTargetZoom &&
      sameZooms(snapshot.terrainDisplayZooms, snapshot.rasterHostZooms) &&
      snapshot.rasterRequestedZooms.length === 1 &&
      snapshot.rasterRequestedZooms[0] === expectedSharedTargetZoom,
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );
  writeSnapshot(stage, "idle", idleSnapshot);

  const allExpected =
    interactingSnapshot.sharedTargetZoom === expectedSharedTargetZoom &&
    interactingSnapshot.sharedLeafZooms.length === 1 &&
    interactingSnapshot.sharedLeafZooms[0] === expectedSharedTargetZoom &&
    interactingSnapshot.terrainParentFallbackCount > 0 &&
    interactingSnapshot.terrainDisplayZooms.some((zoom) => zoom < expectedSharedTargetZoom) &&
    sameZooms(interactingSnapshot.terrainDisplayZooms, interactingSnapshot.rasterHostZooms) &&
    interactingSnapshot.rasterRequestedZooms.includes(expectedSharedTargetZoom) &&
    interactingSnapshot.rasterRequestedZooms.some((zoom) => zoom < expectedSharedTargetZoom) &&
    idleSnapshot.sharedTargetZoom === expectedSharedTargetZoom &&
    idleSnapshot.sharedLeafZooms.length === 1 &&
    idleSnapshot.sharedLeafZooms[0] === expectedSharedTargetZoom &&
    idleSnapshot.terrainParentFallbackCount === 0 &&
    idleSnapshot.terrainDisplayZooms.length === 1 &&
    idleSnapshot.terrainDisplayZooms[0] === expectedSharedTargetZoom &&
    sameZooms(idleSnapshot.terrainDisplayZooms, idleSnapshot.rasterHostZooms) &&
    idleSnapshot.rasterRequestedZooms.length === 1 &&
    idleSnapshot.rasterRequestedZooms[0] === expectedSharedTargetZoom;

  stage.dataset.phase = "after-idle";
  stage.dataset.allExpected = `${allExpected}`;
  status.textContent =
    `after-idle:${formatZooms(interactingSnapshot.terrainDisplayZooms)}->` +
    `${formatZooms(idleSnapshot.terrainDisplayZooms)}|` +
    `${formatZooms(interactingSnapshot.rasterRequestedZooms)}->${formatZooms(idleSnapshot.rasterRequestedZooms)}`;

  (
    window as Window & {
      __gaodePanSmoke?: {
        engine: GlobeEngine;
        interactingSnapshot: SmokeSnapshot;
        idleSnapshot: SmokeSnapshot;
      };
    }
  ).__gaodePanSmoke = {
    engine,
    interactingSnapshot,
    idleSnapshot
  };
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">正在加载高德卫星...</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  const smokeOptions = resolveSmokeOptions();

  if (stage && status) {
    if (smokeOptions.enabled) {
      setStageSize(stage, 960, 540);
    }

    const engine = runGaodeSatellite(stage, status);

    if (smokeOptions.enabled) {
      void runDragPanSmoke(engine, stage, status, smokeOptions.targetZoom)
        .catch((error) => {
          stage.dataset.phase = "error";
          stage.dataset.allExpected = "false";
          status.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
        });
    }
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
